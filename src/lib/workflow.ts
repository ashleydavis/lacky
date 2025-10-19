import Ajv, { ErrorObject } from 'ajv';
import * as path from 'path';
import { Workflow } from '../types/workflow';
import { evaluateJobCondition, evaluateStepCondition } from './job';
import { checkTerraformVersion, handleTerraformSetup, handleAction } from './step';
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
    const tempDir = require('os').tmpdir();
    const outputFile = path.join(tempDir, `github-output-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    require('fs').writeFileSync(outputFile, '', 'utf8');
    return outputFile;
}

// Read outputs from GITHUB_OUTPUT file
function readGitHubOutputs(outputFile: string): Map<string, string> {
    const outputs = new Map<string, string>();
    
    if (!require('fs').existsSync(outputFile)) {
        return outputs;
    }
    
    const content = require('fs').readFileSync(outputFile, 'utf8');
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

export async function validateWorkflowSchema(workflow: Workflow): Promise<{ valid: boolean; errors: string[] }> {
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
            return { valid: false, errors };
        }

        return { valid: true, errors: [] };
    } 
    catch (error: any) {
        return {
            valid: false,
            errors: [`Schema validation failed: ${error.message}`]
        };
    }
}

export async function runWorkflow(workflow: Workflow, isDryRun: boolean, workingDir: string, workflowFile: string, context: WorkflowContext) {
    // Get workflow-level defaults
    const workflowDefaults = workflow.defaults || {};
    const workflowRunDefaults = workflowDefaults.run || {};
    const workflowWorkingDir = workflowRunDefaults['working-directory'];

    const jobs = workflow.jobs || {};
    const jobNames = Object.keys(jobs);

    if (jobNames.length === 0) {
        console.log('No jobs to run');
        return;
    }

    // Flag to track if we're in "run all" mode
    let runAllMode = false;

    // Track completed jobs for dependency resolution
    const completedJobs = new Set<string>();

    // Function to check if job dependencies are met
    const areDependenciesMet = (job: any): boolean => {
        if (!job.needs) return true;
        const needs = Array.isArray(job.needs) ? job.needs : [job.needs];
        return needs.every((dep: string) => completedJobs.has(dep));
    };

    // Function to run a single job instance
    const runJobInstance = async (jobName: string, job: any, matrixValue?: any) => {
        const jobDisplayName = matrixValue ? `${jobName} (${JSON.stringify(matrixValue)})` : jobName;
        console.log(`\n\x1b[97mRunning job: ${jobDisplayName}\x1b[0m`);

        if (job['runs-on']) {
            console.log(`  Runs on: ${job['runs-on']}`);
        }

        if (matrixValue) {
            console.log(`  Matrix: ${JSON.stringify(matrixValue)}`);
        }

        // Check job condition
        if (job.if) {
            const conditionMet = await evaluateJobCondition(job.if, workflow, context);
            if (!conditionMet) {
                console.log(`  ⏭  Skipping job (condition not met: ${job.if})`);
                return;
            }
        }

        // Resolve job-level environment variables for this matrix instance
        const jobEnvVars: { [key: string]: string } = {};
        if (job.env) {
            console.log(`  \x1b[36m[ENV]\x1b[0m`);
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
                    console.log(`    ${key} = "${resolvedValue}"`);
                } else {
                    jobEnvVars[key] = String(value);
                }
            }
        }

        if (job.steps && Array.isArray(job.steps)) {
            console.log(`  \x1b[97mSteps (${job.steps.length}):\x1b[0m`);

            // Get job-level defaults
            const jobDefaults = job.defaults || {};
            const jobRunDefaults = jobDefaults.run || {};
            const jobWorkingDir = jobRunDefaults['working-directory'];

            for (let i = 0; i < job.steps.length; i++) {
                const step = job.steps[i];
                const stepName = step.name || `Step ${i + 1}`;
                const stepUses = step.uses ? step.uses : (step.run ? 'commands' : 'unknown');
                
                // Generate step ID for step outputs
                const stepId = step.id || stepName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

                console.log(`    \x1b[97m${i + 1}. ${stepName} (${stepUses})\x1b[0m`);

                // Check step condition
                if (step.if) {
                    const conditionMet = await evaluateStepCondition(step.if, workflow, jobName, context);
                    if (!conditionMet) {
                        console.log(`      ⏭  Skipping step (condition not met: ${step.if})`);
                        continue;
                    }
                }

                if (step.run) {
                    // Check for working-directory in this order:
                    // 1. Step-level working-directory
                    // 2. Job-level defaults.run.working-directory
                    // 3. Workflow-level defaults.run.working-directory
                    // 4. Repository root
                    const stepWorkingDir = step['working-directory']
                        ? path.resolve(workingDir, step['working-directory'])
                        : jobWorkingDir
                            ? path.resolve(workingDir, jobWorkingDir)
                            : workflowWorkingDir
                                ? path.resolve(workingDir, workflowWorkingDir)
                                : workingDir;

                    // Resolve variables in the command (including matrix variables)
                    let resolvedCommand = await resolveVariablesInCommand(step.run, workflow, stepId, jobName, context, matrixValue);

                    if (isDryRun) {
                        console.log(`      [PREVIEW] Would execute: ${resolvedCommand} (in ${stepWorkingDir})`);
                    } 
                    else {
                        // Ask user for confirmation before running the command
                        console.log(`\n      🔧 COMMAND CONFIRMATION`);
                        console.log(`      Command:   \x1b[36m${resolvedCommand}\x1b[0m`);
                        console.log(`      Directory: \x1b[35m${stepWorkingDir}\x1b[0m`);

                        let shouldRun: 'yes' | 'no' | 'all' | 'quit' | 'skip';

                        if (runAllMode) {
                            shouldRun = 'yes';
                        } 
                        else {
                            shouldRun = await askUserConfirmation(`      \x1b[1mDo you want to run this command?\x1b[0m`);
                        }

                        if (shouldRun === 'quit') {
                            console.log(`      \x1b[31m[QUIT] Exiting workflow...\x1b[0m`);
                            return;
                        }

                        if (shouldRun === 'skip') {
                            console.log(`      ⏭  Skipping command`);
                        } 
                        else if (shouldRun === 'yes' || shouldRun === 'all') {
                            if (shouldRun === 'all') {
                                runAllMode = true;
                                console.log(`      \x1b[33m[RUN ALL MODE ACTIVATED] Will auto-execute all remaining commands\x1b[0m`);
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
                                const result = await executeCommand(resolvedCommand, stepWorkingDir, true, envVars, context.miseVersion);
                                
                                if (result.success) {
                                    spinner.succeed(`\x1b[32mExit code: \x1b[32m${result.exitCode}\x1b[0m`);
                                } 
                                else {
                                    spinner.fail(`\x1b[31mExit code: \x1b[31m${result.exitCode}\x1b[0m`);

                                    // Display output only when command fails
                                    if (result.output) {
                                        console.log(`      \x1b[37m${result.output}\x1b[0m`);
                                    }
                                    if (result.error) {
                                        console.log(`      \x1b[31m${result.error}\x1b[0m`);
                                    }

                                    // Ask if user wants to continue after failure
                                    let shouldContinue: 'yes' | 'no' | 'all' | 'quit' | 'skip';
                                    if (runAllMode) {
                                        shouldContinue = 'yes';
                                        console.log(`      \x1b[32m[RUN ALL MODE] Continuing despite failure...\x1b[0m`);
                                    } 
                                    else {
                                        shouldContinue = await askUserConfirmation(`      Do you want to continue with the next step?`);
                                    }
                                    if (shouldContinue === 'quit') {
                                        console.log(`      \x1b[31m[QUIT] Exiting workflow...\x1b[0m`);
                                        return;
                                    }
                                    if (shouldContinue === 'no') {
                                        console.log(`      Stopping workflow execution`);
                                        return;
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
                                        console.log(`      [OUTPUT] ${key} = "${value}"`);
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
                            console.log(`      ⏭  Skipping command`);
                        }
                    }
                } 
                else {
                    // For non-run steps (like uses), check for special actions
                    if (step.uses && step.uses.includes('hashicorp/setup-terraform')) {
                        // Calculate working directory for this step (same logic as run steps)
                        const stepWorkingDir = step['working-directory']
                            ? path.resolve(workingDir, step['working-directory'])
                            : jobWorkingDir
                                ? path.resolve(workingDir, jobWorkingDir)
                                : workflowWorkingDir
                                    ? path.resolve(workingDir, workflowWorkingDir)
                                    : workingDir;
                        await handleTerraformSetup(step, isDryRun, workflow, stepWorkingDir, jobName, context);
                    } 
                    else if (step.uses && step.uses.startsWith('actions/checkout')) {
                        // Skip actions/checkout - repo is expected to be already checked out
                        console.log(`      ⏭  Skipping ${step.uses} (repo already checked out)`);
                    }
                    else if (step.uses) {
                        // Handle any other action (custom or built-in) - let the mock system determine if a mock exists
                        // Calculate working directory for this step (same logic as run steps)
                        const stepWorkingDir = step['working-directory']
                            ? path.resolve(workingDir, step['working-directory'])
                            : jobWorkingDir
                                ? path.resolve(workingDir, jobWorkingDir)
                                : workflowWorkingDir
                                    ? path.resolve(workingDir, workflowWorkingDir)
                                    : workingDir;
                        await handleAction(step, isDryRun, workflow, stepWorkingDir, stepId, workflowFile, jobName, context);
                    }
                    else {
                        if (isDryRun) {
                            console.log(`      [PREVIEW] Would run ${stepUses} step`);
                        } 
                        else {
                            console.log(`      Running ${stepUses} step...`);
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
            
            console.log(`  \x1b[36m[OUTPUTS]\x1b[0m`);
            for (const [outputName, outputExpression] of Object.entries(job.outputs)) {
                const outputValue = await resolveJobOutputExpression(outputExpression as string, jobName, workflow, context);
                context.jobOutputs.get(jobName)!.set(outputName, outputValue);
                console.log(`    ${outputName} = "${outputValue}"`);
            }
        }

        console.log(`  \x1b[32m✓\x1b[0m Job '${jobDisplayName}' completed`);
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
                console.log(`  \x1b[36m[MATRIX]\x1b[0m`);
                console.log(`  Matrix combinations (${matrixValues.length}):`);
                for (let i = 0; i < matrixValues.length; i++) {
                    console.log(`    ${i + 1}. ${JSON.stringify(matrixValues[i])}`);
                }
                console.log('');

                // Run job for each matrix combination
                for (let i = 0; i < matrixValues.length; i++) {
                    const matrixValue = matrixValues[i];
                    console.log(`\n\x1b[33mRunning matrix job ${i + 1} of ${matrixValues.length}\x1b[0m`);
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
}
