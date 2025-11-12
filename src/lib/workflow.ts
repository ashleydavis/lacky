import Ajv, { ErrorObject } from 'ajv';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import pc from 'picocolors';
import { Workflow } from '../types/workflow';
import { evaluateJobCondition, evaluateStepCondition } from './job';
import { handleTerraformSetup, handleAction } from './step';
import { 
    extractGitHubExpressions, 
    resolveGitHubExpression, 
    resolveVariablesInCommand, 
    resolveJobOutputExpression
} from './resolve-variable';
import { WorkflowContext } from './context';
import { askUserConfirmation, createSpinner } from './input';
import { executeCommand } from './command';
import { GITHUB_ENV_VARS } from './shared';

const GITHUB_WORKFLOW_SCHEMA_URL = 'https://json.schemastore.org/github-workflow.json';

// Create a temporary GITHUB_OUTPUT file
function createGitHubOutputFile(): string {
    const tempDir = os.tmpdir();
    const outputFile = path.join(tempDir, `github-output-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    fs.writeFileSync(outputFile, '', 'utf8');
    return outputFile;
}

// Read outputs from GITHUB_OUTPUT file
function readGitHubOutputs(outputFile: string): Map<string, string> {
    const outputs = new Map<string, string>();
    
    if (!fs.existsSync(outputFile)) {
        return outputs;
    }
    
    const content = fs.readFileSync(outputFile, 'utf8');
    const lines = content.split('\n');
    
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine && trimmedLine.includes('=')) {
            const [key, ...valueParts] = trimmedLine.split('=');
            const value = valueParts.join('=');
            outputs.set(key.trim(), value.trim());
        }
    }
    
    return outputs;
}

//
// Validates the workflow against the GitHub workflow schema.
//
export async function validateWorkflowSchema(workflow: Workflow): Promise<void> {
    try {
        // Fetch the GitHub workflow schema
        const response = await fetch(GITHUB_WORKFLOW_SCHEMA_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch schema: ${response.statusText}`);
        }

        const schema = await response.json();

        // Create AJV instance and validate
        const ajv = new Ajv({
            allErrors: true,
            strict: false,
            strictTypes: false,
            strictTuples: false
        });
        const validate = ajv.compile(schema);
        const valid = validate(workflow);
        if (!valid) {
            const errors = validate.errors?.map((err: ErrorObject) =>
                `${err.instancePath || 'root'}: ${err.message}`
            ) || ['Unknown validation error'];
            console.error(`Schema validation failed:\n${errors.join('\n')}`);
            process.exit(1);
        }
    } 
    catch (error: any) {
        console.error(`Schema validation failed: ${error.message}`);
        console.error(error.stack || error);
        process.exit(1);
    }
}

// Helper function to truncate output
function truncateOutput(output: string, linesCount: number): { truncated: string; wasTruncated: boolean } {
    const lines = output.split('\n');
    const totalLines = linesCount * 2;
    
    if (lines.length <= totalLines) {
        return { truncated: output, wasTruncated: false };
    }

    const headLines = lines.slice(0, linesCount);
    const tailLines = lines.slice(-linesCount);
    const omittedCount = lines.length - headLines.length - tailLines.length;
    const truncated = `${headLines.join('\n')}\n\n... (${omittedCount} more lines omitted, use --full to see all) ...\n\n${tailLines.join('\n')}`;
    
    return { 
        truncated,
        wasTruncated: true
    };
}

export async function runWorkflow(workflow: Workflow, isDryRun: boolean, workingDir: string, workflowFile: string, context: WorkflowContext, showFullOutput: boolean, truncateLines: number) {
    // Get workflow-level defaults
    const workflowDefaults = workflow.defaults || {};
    const workflowRunDefaults = workflowDefaults.run || {};
    const workflowWorkingDirRaw = workflowRunDefaults['working-directory'];
    // Resolve variables in workflow-level working-directory
    const workflowWorkingDir = workflowWorkingDirRaw 
        ? await resolveVariablesInCommand(workflowWorkingDirRaw, workflow, 'workflow-defaults', '', context)
        : undefined;

    const jobs = workflow.jobs || {};
    const jobNames = Object.keys(jobs);

    if (jobNames.length === 0) {
        console.log('No jobs to run');
        return;
    }

    // Flags to track if we're in "run all" mode (separate for jobs and commands)
    let runAllJobsMode = false;
    let runAllCommandsMode = false;

    // Track completed jobs for dependency resolution
    const completedJobs = new Set<string>();

    // Track execution results for summary
    type StepResult = {
        name: string;
        status: 'success' | 'failed' | 'skipped';
        command?: string;
    };
    type JobResult = {
        name: string;
        status: 'success' | 'failed' | 'skipped';
        steps: StepResult[];
    };
    const executionResults: JobResult[] = [];

    // Function to check if job dependencies are met
    const areDependenciesMet = (job: any): boolean => {
        if (!job.needs) return true;
        const needs = Array.isArray(job.needs) ? job.needs : [job.needs];
        return needs.every((dep: string) => completedJobs.has(dep));
    };

    // Function to run a single job instance
    const runJobInstance = async (jobName: string, job: any, matrixValue?: any) => {
        const jobDisplayName = matrixValue ? `${jobName} (${JSON.stringify(matrixValue)})` : jobName;
        console.log(`\n${pc.bold(`Running job: ${pc.magenta(jobDisplayName)}`)}`);

        // Create job result tracker
        const jobResult: JobResult = {
            name: jobDisplayName,
            status: 'success',
            steps: []
        };
        executionResults.push(jobResult);

        if (job['runs-on']) {
            console.log(`Runs on: ${job['runs-on']}`);
        }

        if (matrixValue) {
            console.log(`Matrix: ${JSON.stringify(matrixValue)}`);
        }

        // Ask user if they want to run this job (unless we're in run all jobs mode)
        let runJobResponse: 'yes' | 'no' | 'all' | 'quit' | 'skip';
        
        if (runAllJobsMode) {
            runJobResponse = 'yes';
        } else {
            runJobResponse = await askUserConfirmation(`Do you want to run job '${jobDisplayName}'?`);
        }
        
        if (runJobResponse === 'no' || runJobResponse === 'skip') {
            console.log('   Skipping job (user chose not to run)');
            jobResult.status = 'skipped';
            return;
        }
        
        if (runJobResponse === 'quit') {
            console.log('🛑 Quitting workflow execution');
            jobResult.status = 'skipped';
            throw new Error('Workflow execution stopped by user');
        }
        
        if (runJobResponse === 'all') {
            runAllJobsMode = true;
            console.log(pc.yellow('[RUN ALL JOBS MODE ACTIVATED] Will auto-run all remaining jobs'));
        }

        // Check job condition
        if (job.if) {
            const conditionMet = await evaluateJobCondition(job.if, workflow, context);
            if (!conditionMet) {
                console.log(`   Skipping job (condition not met: ${job.if})`);
                jobResult.status = 'skipped';
                return;
            }
        }

        // Resolve job-level environment variables for this matrix instance
        const jobEnvVars: { [key: string]: string } = {};
        if (job.env) {
            console.log('[ENV]');
            for (const [key, value] of Object.entries(job.env)) {
                if (typeof value === 'string') {
                    // Resolve any GitHub expressions in the env value, including matrix variables
                    let resolvedValue = value;
                    
                    // Handle matrix variables in env values
                    if (matrixValue) {
                        for (const [matrixKey, matrixVal] of Object.entries(matrixValue)) {
                            const matrixPattern = new RegExp(`\\$\\{\\{\\s*matrix\\.${matrixKey}\\s*\\}\\}`, 'g');
                            resolvedValue = resolvedValue.replace(matrixPattern, String(matrixVal));
                        }
                    }
                    
                    // Resolve other GitHub expressions
                    const githubExpressions = extractGitHubExpressions(resolvedValue);
                    for (const expression of githubExpressions) {
                        const exprValue = await resolveGitHubExpression(expression, workflow, context);
                        const placeholder = '${{ ' + expression + ' }}';
                        resolvedValue = resolvedValue.replace(placeholder, exprValue);
                    }
                    
                    jobEnvVars[key] = resolvedValue;
                    console.log(`${key} = "${resolvedValue}"`);
                } else {
                    jobEnvVars[key] = String(value);
                }
            }
        }

        if (job.steps && Array.isArray(job.steps)) {

            // Get job-level defaults
            const jobDefaults = job.defaults || {};
            const jobRunDefaults = jobDefaults.run || {};
            const jobWorkingDirRaw = jobRunDefaults['working-directory'];
            // Resolve variables in job-level working-directory (including matrix variables)
            const jobWorkingDir = jobWorkingDirRaw
                ? await resolveVariablesInCommand(jobWorkingDirRaw, workflow, 'job-defaults', jobName, context, matrixValue)
                : undefined;

            for (let i = 0; i < job.steps.length; i++) {
                const step = job.steps[i];
                const stepName = step.name || `Step ${i + 1}`;
                const stepUses = step.uses ? `(${step.uses})` : ``;
                
                // Generate step ID for step outputs
                const stepId = step.id || stepName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

                console.log(`${i + 1}. ${stepName} ${stepUses}`);

                // Create step result tracker
                const stepResult: StepResult = {
                    name: stepName,
                    status: 'success',
                    command: step.run
                };
                jobResult.steps.push(stepResult);

                // Check step condition
                if (step.if) {
                    const conditionMet = await evaluateStepCondition(step.if, workflow, jobName, context);
                    if (!conditionMet) {
                        console.log(`   Skipping step (condition not met: ${step.if})`);
                        stepResult.status = 'skipped';
                        continue;
                    }
                }

                if (step.run) {
                    // Check for working-directory in this order:
                    // 1. Step-level working-directory
                    // 2. Job-level defaults.run.working-directory
                    // 3. Workflow-level defaults.run.working-directory
                    // 4. Repository root
                    const stepWorkingDirRaw = step['working-directory'];
                    const resolvedStepWorkingDir = stepWorkingDirRaw
                        ? await resolveVariablesInCommand(stepWorkingDirRaw, workflow, stepId, jobName, context, matrixValue)
                        : undefined;
                    const stepWorkingDir = resolvedStepWorkingDir
                        ? path.resolve(workingDir, resolvedStepWorkingDir)
                        : jobWorkingDir
                            ? path.resolve(workingDir, jobWorkingDir)
                            : workflowWorkingDir
                                ? path.resolve(workingDir, workflowWorkingDir)
                                : workingDir;

                    // Resolve variables in the command (including matrix variables)
                    let resolvedCommand = await resolveVariablesInCommand(step.run, workflow, stepId, jobName, context, matrixValue);

                    if (isDryRun) {
                        console.log(`[PREVIEW] Would execute: ${resolvedCommand} (in ${stepWorkingDir})`);
                    } 
                    else {
                        // Ask user for confirmation before running the command
                        if (resolvedCommand.includes('\n')) {
                            console.log(pc.magenta('\nCommand:'));
                            console.log(pc.yellow(resolvedCommand));
                        } else {
                            console.log(`${pc.magenta('\nCommand:')}   ${pc.yellow(resolvedCommand)}`);
                        }
                        console.log(`Directory: ${pc.cyan(stepWorkingDir)}`);

                        let shouldRun: 'yes' | 'no' | 'all' | 'quit' | 'skip';

                        if (runAllCommandsMode) {
                            shouldRun = 'yes';
                        } 
                        else {
                            shouldRun = await askUserConfirmation(pc.bold('Please review the command above. Do you trust this command and want to run it on your computer?'));
                        }

                        if (shouldRun === 'quit') {
                            console.log(pc.red('[QUIT] Exiting workflow...'));
                            stepResult.status = 'skipped';
                            jobResult.status = 'skipped';
                            return;
                        }

                        if (shouldRun === 'skip') {
                            console.log('   Skipping command');
                            stepResult.status = 'skipped';
                        } 
                        else if (shouldRun === 'yes' || shouldRun === 'all') {
                            if (shouldRun === 'all') {
                                runAllCommandsMode = true;
                                console.log(pc.yellow('[RUN ALL COMMANDS MODE ACTIVATED] Will auto-execute all remaining commands'));
                            }

                            // Start animated progress indicator
                            const spinner = createSpinner();
                            spinner.start();

                            try {
                                // Create a new GITHUB_OUTPUT file for this job
                                const githubOutputFile = createGitHubOutputFile();
                                const envVars: Record<string, string> = { 
                                    ...GITHUB_ENV_VARS,
                                    ...jobEnvVars,
                                    GITHUB_OUTPUT: githubOutputFile,
                                };
                                const result = await executeCommand(resolvedCommand, stepWorkingDir, false, envVars, context.miseVersion);
                                
                                // Stop spinner first
                                spinner.stop();

                                // Print output first
                                if (result.output) {
                                    console.log('\nStdout:');
                                    if (showFullOutput) {
                                        console.log(pc.gray(result.output));
                                    } else {
                                        const { truncated } = truncateOutput(result.output, truncateLines);
                                        console.log(pc.gray(truncated));
                                    }
                                }
                                if (result.error) {
                                    console.log('\nStderr:');
                                    if (showFullOutput) {
                                        console.log(pc.gray(result.error));
                                    } else {
                                        const { truncated } = truncateOutput(result.error, truncateLines);
                                        console.log(pc.gray(truncated));
                                    }
                                }

                                // Then show success/fail with exit code
                                if (result.success) {
                                    console.log(pc.green(`✓ Exit code: ${result.exitCode}`));
                                    stepResult.status = 'success';
                                } 
                                else {
                                    console.log(pc.red(`✗ Exit code: ${result.exitCode}`));
                                    stepResult.status = 'failed';
                                    jobResult.status = 'failed';
                                }

                                if (!result.success) {
                                    // Ask if user wants to continue after failure
                                    let shouldContinue: 'yes' | 'no' | 'all' | 'quit' | 'skip';
                                    if (runAllCommandsMode) {
                                        shouldContinue = 'yes';
                                        console.log(pc.green('[RUN ALL COMMANDS MODE] Continuing despite failure...'));
                                    } 
                                    else {
                                        shouldContinue = await askUserConfirmation(`Do you want to continue with the next step?`);
                                    }
                                    if (shouldContinue === 'quit') {
                                        console.log(pc.red('[QUIT] Exiting workflow...'));
                                        return;
                                    }
                                    if (shouldContinue === 'no') {
                                        console.log('Stopping workflow execution');
                                        return;
                                    }
                                    if (shouldContinue === 'all') {
                                        runAllCommandsMode = true;
                                        console.log(pc.yellow('[RUN ALL COMMANDS MODE ACTIVATED] Will auto-execute all remaining commands'));
                                    }
                                }

                                // Read outputs from GITHUB_OUTPUT file and set step outputs
                                let githubOutputs = readGitHubOutputs(githubOutputFile);                                
                                if (githubOutputs.size > 0) {
                                    if (!context.stepOutputs.has(jobName)) {
                                        context.stepOutputs.set(jobName, new Map());
                                    }
                                    if (!context.stepOutputs.get(jobName)!.has(stepId)) {
                                        context.stepOutputs.get(jobName)!.set(stepId, new Map());
                                    }
                                    
                                    for (const [key, value] of githubOutputs) {
                                        context.stepOutputs.get(jobName)!.get(stepId)!.set(key, value);
                                        console.log(pc.gray(`[OUTPUT] ${key} = "${value}"`));
                                    }
                                }
                                
                                // Clean up the temporary file
                                //TODO: Might want to actually look at this.
                                // fs.unlinkSync(githubOutputFile);
                            } 
                            catch (error) {
                                spinner.fail('Command execution failed');
                                throw error;
                            }
                        } 
                        else {
                            console.log('   Skipping command');
                        }
                    }
                } 
                else {
                    // For non-run steps (like uses), check for special actions
                    if (step.uses && step.uses.includes('hashicorp/setup-terraform')) {
                        // Calculate working directory for this step (same logic as run steps)
                        const stepWorkingDirRaw = step['working-directory'];
                        const resolvedStepWorkingDir = stepWorkingDirRaw
                            ? await resolveVariablesInCommand(stepWorkingDirRaw, workflow, stepId, jobName, context, matrixValue)
                            : undefined;
                        const stepWorkingDir = resolvedStepWorkingDir
                            ? path.resolve(workingDir, resolvedStepWorkingDir)
                            : jobWorkingDir
                                ? path.resolve(workingDir, jobWorkingDir)
                                : workflowWorkingDir
                                    ? path.resolve(workingDir, workflowWorkingDir)
                                    : workingDir;
                        await handleTerraformSetup(step, isDryRun, workflow, stepWorkingDir, jobName, context);
                    } 
                    else if (step.uses && step.uses.startsWith('actions/checkout')) {
                        // Skip actions/checkout - repo is expected to be already checked out
                        console.log(`   Skipping ${step.uses} (repo already checked out)`);
                        stepResult.status = 'skipped';
                    }
                    else if (step.uses) {
                        // Handle any other action (custom or built-in) - let the mock system determine if a mock exists
                        // Calculate working directory for this step (same logic as run steps)
                        const stepWorkingDirRaw = step['working-directory'];
                        const resolvedStepWorkingDir = stepWorkingDirRaw
                            ? await resolveVariablesInCommand(stepWorkingDirRaw, workflow, stepId, jobName, context, matrixValue)
                            : undefined;
                        const stepWorkingDir = resolvedStepWorkingDir
                            ? path.resolve(workingDir, resolvedStepWorkingDir)
                            : jobWorkingDir
                                ? path.resolve(workingDir, jobWorkingDir)
                                : workflowWorkingDir
                                    ? path.resolve(workingDir, workflowWorkingDir)
                                    : workingDir;
                        const actionStatus = await handleAction(step, isDryRun, workflow, stepWorkingDir, stepId, workflowFile, jobName, context);
                        stepResult.status = actionStatus;
                        if (actionStatus === 'failed') {
                            jobResult.status = 'failed';
                        }
                    }
                    else {
                        if (isDryRun) {
                            console.log(`[PREVIEW] Would run ${stepUses} step`);
                        } 
                        else {
                            console.log(`Running ${stepUses} step...`);
                            await new Promise(resolve => setTimeout(resolve, 500));
                        }
                    }
                }

                // Add blank line after each step
                console.log('');
            }
        }

        // Also collect job outputs from the workflow definition
        if (job.outputs) {
            if (!context.jobOutputs.has(jobName)) {
                context.jobOutputs.set(jobName, new Map());
            }
            
            console.log('[OUTPUTS]');
            for (const [outputName, outputExpression] of Object.entries(job.outputs)) {
                const outputValue = await resolveJobOutputExpression(outputExpression as string, jobName, workflow, context);
                context.jobOutputs.get(jobName)!.set(outputName, outputValue);
                console.log(`${outputName} = "${outputValue}"`);
            }
        }

        console.log(pc.green(`✓ Job '${jobDisplayName}' completed`));
    };

    // Main job execution loop with dependency resolution
    while (completedJobs.size < jobNames.length) {
        let anyJobRun = false;

        for (const jobName of jobNames) {
            if (completedJobs.has(jobName)) continue;

            const job = jobs[jobName];
            
            // Check if dependencies are met
            if (!areDependenciesMet(job)) {
                continue;
            }

            // Handle matrix strategy
            if (job.strategy && job.strategy.matrix) {
                const matrix = job.strategy.matrix;
                const matrixKeys = Object.keys(matrix);
                const matrixValues: any[] = [];

                // Resolve matrix values first
                const resolvedMatrix: any = {};
                for (const key of matrixKeys) {
                    const value: any = matrix[key];
                    if (typeof value === 'string' && value.includes('${{')) {
                        // This is a GitHub expression that needs to be resolved
                        const resolvedValue = await resolveGitHubExpression(value, workflow, context);
                        try {
                            // Try to parse as JSON (for arrays)
                            resolvedMatrix[key] = JSON.parse(resolvedValue);
                        } catch {
                            // If not JSON, treat as single value
                            resolvedMatrix[key] = resolvedValue;
                        }
                    } else {
                        resolvedMatrix[key] = value;
                    }
                }

                // Generate all combinations of matrix values
                const generateCombinations = (keys: string[], index: number, current: any) => {
                    if (index === keys.length) {
                        matrixValues.push({ ...current });
                        return;
                    }
                    
                    const key = keys[index];
                    const values = Array.isArray(resolvedMatrix[key]) ? resolvedMatrix[key] : [resolvedMatrix[key]];
                    
                    for (const value of values) {
                        current[key] = value;
                        generateCombinations(keys, index + 1, current);
                    }
                };

                generateCombinations(matrixKeys, 0, {});

                // Display matrix combinations
                console.log('[MATRIX]');
                console.log(`Matrix combinations (${matrixValues.length}):`);
                for (let i = 0; i < matrixValues.length; i++) {
                    console.log(`${i + 1}. ${JSON.stringify(matrixValues[i])}`);
                }
                console.log('');

                // Run job for each matrix combination
                for (let i = 0; i < matrixValues.length; i++) {
                    const matrixValue = matrixValues[i];
                    console.log(`\n${pc.yellow(`Running matrix job ${i + 1} of ${matrixValues.length}`)}`);
                    await runJobInstance(jobName, job, matrixValue);
                    anyJobRun = true;
                }
            } else {
                // Run job without matrix
                await runJobInstance(jobName, job);
                anyJobRun = true;
            }

            completedJobs.add(jobName);
        }

        // If no jobs could run, there might be a circular dependency
        if (!anyJobRun) {
            const remainingJobs = jobNames.filter(name => !completedJobs.has(name));
            console.log(`\n⚠️  Warning: No jobs could run. Remaining jobs: ${remainingJobs.join(', ')}`);
            console.log('This might indicate a circular dependency or missing job outputs.');
            break;
        }
    }

    // Print execution summary
    printExecutionSummary(workflow.name || 'Workflow', executionResults);
}

function printExecutionSummary(workflowName: string, results: Array<{name: string; status: 'success' | 'failed' | 'skipped'; steps: Array<{name: string; status: 'success' | 'failed' | 'skipped'; command?: string}>}>) {
    console.log('\n' + pc.bold('═'.repeat(60)));
    console.log(pc.bold('Summary'));
    
    const statusIcon = (status: 'success' | 'failed' | 'skipped') => {
        if (status === 'success') return pc.green('✓');
        if (status === 'failed') return pc.red('✗');
        return pc.gray('⊝');
    };
    
    const statusColor = (status: 'success' | 'failed' | 'skipped', text: string) => {
        if (status === 'success') return pc.green(text);
        if (status === 'failed') return pc.red(text);
        return pc.gray(text);
    };
    
    // Print ASCII tree
    console.log(`\n${pc.bold(workflowName)}`);
    
    for (let i = 0; i < results.length; i++) {
        const job = results[i];
        const isLastJob = i === results.length - 1;
        const jobPrefix = isLastJob ? '└─' : '├─';
        const childPrefix = isLastJob ? '  ' : '│ ';
        
        // Empty line before each job (with tree continuation)
        if (i > 0) {
            console.log('│');
        }
        console.log(`${jobPrefix} ${statusIcon(job.status)} ${statusColor(job.status, job.name)}`);
        
        for (let j = 0; j < job.steps.length; j++) {
            const step = job.steps[j];
            const isLastStep = j === job.steps.length - 1;
            const stepPrefix = isLastStep ? '└─' : '├─';
            
            console.log(`${childPrefix}${stepPrefix} ${statusIcon(step.status)} ${statusColor(step.status, step.name)}`);
            
            // Show command as a single leaf node (max 3 lines)
            if (step.command) {
                const commandLines = step.command.split('\n').filter(line => line.trim());
                const maxLines = 3;
                const truncated = commandLines.length > maxLines;
                const displayLines = truncated ? commandLines.slice(0, maxLines) : commandLines;
                const cmdPrefix = isLastStep ? '  ' : '│ ';
                
                // First line of command with tree character
                console.log(`${childPrefix}${cmdPrefix}└─ ${pc.gray(displayLines[0].trim())}`);
                
                // Remaining lines indented without tree characters
                for (let k = 1; k < displayLines.length; k++) {
                    console.log(`${childPrefix}${cmdPrefix}   ${pc.gray(displayLines[k].trim())}`);
                }
                
                // Show truncation indicator if there are more lines
                if (truncated) {
                    const omittedCount = commandLines.length - maxLines;
                    console.log(`${childPrefix}${cmdPrefix}   ${pc.gray(`... (${omittedCount} more line${omittedCount > 1 ? 's' : ''})`)}`);
                }
            }
        }
    }
    
    // Print summary stats
    const totalJobs = results.length;
    const successfulJobs = results.filter(j => j.status === 'success').length;
    const failedJobs = results.filter(j => j.status === 'failed').length;
    const skippedJobs = results.filter(j => j.status === 'skipped').length;
    
    const allSteps = results.flatMap(j => j.steps);
    const totalSteps = allSteps.length;
    const successfulSteps = allSteps.filter(s => s.status === 'success').length;
    const failedSteps = allSteps.filter(s => s.status === 'failed').length;
    const skippedSteps = allSteps.filter(s => s.status === 'skipped').length;

    console.log();
        
    const jobParts = [pc.green(`${successfulJobs} passed`)];
    if (failedJobs > 0) jobParts.push(pc.red(`${failedJobs} failed`));
    if (skippedJobs > 0) jobParts.push(pc.gray(`${skippedJobs} skipped`));
    console.log(`Jobs:  ${jobParts.join(', ')} (${totalJobs} total)`);
    
    const stepParts = [pc.green(`${successfulSteps} passed`)];
    if (failedSteps > 0) stepParts.push(pc.red(`${failedSteps} failed`));
    if (skippedSteps > 0) stepParts.push(pc.gray(`${skippedSteps} skipped`));
    console.log(`Steps: ${stepParts.join(', ')} (${totalSteps} total)`);
}
