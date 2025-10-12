#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import Ajv, { ErrorObject } from 'ajv';
import { spawn, execSync } from 'child_process';
import * as readline from 'readline';
import ora from 'ora';

const program = new Command();

// GitHub workflow schema URL
const GITHUB_WORKFLOW_SCHEMA_URL = 'https://json.schemastore.org/github-workflow.json';

// Store resolved variables
const resolvedVariables = new Map<string, string>();

// Check if mise is installed and get version
function checkMiseInstallation(): string | null {
    try {
        const version = execSync('mise --version', {
            shell: '/bin/bash',
            encoding: 'utf-8',
            stdio: 'pipe'
        }).trim();
        return version;
    } 
    catch (error) {
        return null;
    }
}

function extractGitHubExpressions(text: string): string[] {
    const expressionRegex = /\$\{\{\s*([^}]+)\s*\}\}/g;
    const expressions: string[] = [];
    let match;

    while ((match = expressionRegex.exec(text)) !== null) {
        expressions.push(match[1].trim());
    }

    return expressions;
}

async function resolveGitHubExpression(expression: string, workflow?: any): Promise<string> {
    // Check if we already have this value
    if (resolvedVariables.has(expression)) {
        return resolvedVariables.get(expression)!;
    }

    // Handle different types of expressions
    if (expression.startsWith('github.event.inputs.')) {
        const inputName = expression.replace('github.event.inputs.', '');
        const value = await askUserForInput(`Enter value for input '${inputName}': `);
        resolvedVariables.set(expression, value);
        return value;
    }

    if (expression.startsWith('env.')) {
        const envVarName = expression.replace('env.', '');

        // Check if this env var is defined in the workflow
        if (workflow?.env && workflow.env[envVarName]) {
            const value = workflow.env[envVarName];
            resolvedVariables.set(expression, value);
            return value;
        }

        // If not in workflow, ask user
        const value = await askUserForInput(`Enter value for environment variable '${envVarName}': `);
        resolvedVariables.set(expression, value);
        return value;
    }

    if (expression.startsWith('github.ref_name')) {
        const value = await askUserForInput('Enter branch/tag name (github.ref_name): ');
        resolvedVariables.set(expression, value);
        return value;
    }

    if (expression.startsWith('github.sha')) {
        const value = await askUserForInput('Enter commit SHA (github.sha): ');
        resolvedVariables.set(expression, value);
        return value;
    }

    if (expression.startsWith('github.workspace')) {
        const value = await askUserForInput('Enter workspace path (github.workspace): ');
        resolvedVariables.set(expression, value);
        return value;
    }

    // For other expressions, ask the user
    const value = await askUserForInput(`Enter value for '${expression}': `);
    resolvedVariables.set(expression, value);
    return value;
}

async function askUserForInput(prompt: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

async function resolveVariablesInCommand(command: string, workflow?: any): Promise<string> {
    const expressions = extractGitHubExpressions(command);

    if (expressions.length === 0) {
        return command;
    }

    let resolvedCommand = command;
    for (const expression of expressions) {
        const value = await resolveGitHubExpression(expression, workflow);
        const placeholder = '${{ ' + expression + ' }}';
        resolvedCommand = resolvedCommand.replace(placeholder, value);
    }

    return resolvedCommand;
}

async function checkTerraformVersion(resolvedVersion: string, terraformWorkingDir: string): Promise<void> {
    // Use executeCommand which will run in the local shell and pick up mise environment
    const result = await executeCommand('terraform version -json', terraformWorkingDir);

    if (!result.success) {
        console.log(`      ✖ Failed to get local Terraform version: ${result.error}`);
        console.log(`      Please ensure Terraform is installed and available in PATH`);
        process.exit(1);
    }

    // Parse the JSON output to get version
    const versionInfo = JSON.parse(result.output);
    const localVersion = versionInfo.terraform_version;

    console.log(`      Local Terraform version: ${localVersion}`);

    // Compare versions (handle version strings like "1.5.0" vs "1.5.0+ent")
    const normalizedRequired = resolvedVersion.replace(/[^0-9.]/g, '');
    const normalizedLocal = localVersion.replace(/[^0-9.]/g, '');

    if (normalizedLocal !== normalizedRequired) {
        console.log(`      ✖ Terraform version mismatch!`);
        console.log(`      Required: ${resolvedVersion}`);
        console.log(`      Local: ${localVersion}`);
        console.log(`      Please install the correct Terraform version or update the workflow`);
        process.exit(1);
    }

    console.log(`      \x1b[32m✓\x1b[0m Terraform version matches (${localVersion})`);
}

async function handleTerraformSetup(step: any, isDryRun: boolean, workflow?: any, workingDir?: string): Promise<void> {
    console.log(`      Setting up Terraform...`);

    // Extract terraform_version from step.with
    const terraformVersion = step.with?.['terraform_version'];

    if (!terraformVersion) {
        console.log(`      ⚠️  Warning: No terraform_version specified in setup-terraform action`);
        return;
    }

    // Resolve any variables in the version
    const resolvedVersion = await resolveVariablesInCommand(terraformVersion, workflow);

    console.log(`      Required Terraform version: ${resolvedVersion}`);

    if (isDryRun) {
        console.log(`      [PREVIEW] Would check local Terraform version against ${resolvedVersion}`);
        return;
    }

    // Check local Terraform version
    try {
        const terraformWorkingDir = workingDir || process.cwd();
        console.log(`      Checking Terraform version in: ${terraformWorkingDir}`);

        await checkTerraformVersion(resolvedVersion, terraformWorkingDir);

    } 
    catch (error: any) {
        console.log(`      ✖ Error checking Terraform version: ${error.message}`);
        process.exit(1);
    }
}

async function validateWorkflowSchema(workflow: any): Promise<{ valid: boolean; errors: string[] }> {
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

function createSpinner() {
    return ora({
        text: 'Running...',
        color: 'cyan',
        spinner: 'dots',
        indent: 6
    });
}

function askUserConfirmation(question: string): Promise<'yes' | 'no' | 'all' | 'quit' | 'skip'> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(`${question} (y/n/a/q/s): `, (answer) => {
            rl.close();
            const lowerAnswer = answer.toLowerCase();
            if (lowerAnswer === 'y' || lowerAnswer === 'yes') {
                resolve('yes');
            } 
            else if (lowerAnswer === 'a' || lowerAnswer === 'all') {
                resolve('all');
            } 
            else if (lowerAnswer === 'q' || lowerAnswer === 'quit') {
                resolve('quit');
            } 
            else if (lowerAnswer === 's' || lowerAnswer === 'skip') {
                resolve('skip');
            } 
            else {
                resolve('no');
            }
        });
    });
}

function executeCommand(command: string, cwd: string, showOutput: boolean = false): Promise<{ success: boolean; output: string; error: string; exitCode: number }> {
    return new Promise((resolve) => {
        // Check if mise is available
        const miseVersion = checkMiseInstallation();
        let shellCommand: string;

        if (miseVersion) {
            // Use mise to activate the environment
            shellCommand = `cd "${cwd}" && eval "$(mise activate bash)" && ${command}`;
        } 
        else {
            // Fallback to regular command execution
            shellCommand = `cd "${cwd}" && ${command}`;
        }

        const child = spawn('bash', ['-c', shellCommand], {
            cwd: process.cwd(),
            stdio: 'pipe'
        });

        let output = '';
        let error = '';

        child.stdout?.on('data', (data) => {
            const text = data.toString();
            output += text;
        });

        child.stderr?.on('data', (data) => {
            const text = data.toString();
            error += text;
        });

        child.on('close', (code) => {
            resolve({
                success: code === 0,
                output,
                error,
                exitCode: code || 0
            });
        });

        child.on('error', (err) => {
            resolve({
                success: false,
                output,
                error: err.message,
                exitCode: 1
            });
        });
    });
}

program
    .name('lacky')
    .description('A CLI tool to run a GitHub Actions Workflow locally')
    .version('1.0.0')
    .argument('<workflow-file>', 'Path to the GitHub workflow YAML file')
    .option('-d, --dry-run', 'Show what commands would be executed without running them (preview)')
    .action(async (workflowFile, options) => {
        try {
            // Check mise installation and print version
            const miseVersion = checkMiseInstallation();
            if (miseVersion) {
                console.log(`mise version: ${miseVersion}`);
            } 
            else {
                console.log('mise not found - commands will run without environment management');
            }

            // Check if file exists
            if (!fs.existsSync(workflowFile)) {
                console.error(`Error: Workflow file '${workflowFile}' not found`);
                process.exit(1);
            }

            // Read and validate YAML
            console.log(`Reading workflow file: \x1b[32m${workflowFile}\x1b[0m`);
            const fileContent = fs.readFileSync(workflowFile, 'utf8');

            try {
                const workflow = yaml.load(fileContent) as any;
                console.log('\x1b[32m✓\x1b[0m YAML syntax is valid');

                // Basic workflow validation
                if (!workflow || typeof workflow !== 'object') {
                    throw new Error('Invalid workflow structure');
                }

                // Validate against GitHub workflow schema
                const schemaValidation = await validateWorkflowSchema(workflow);

                if (!schemaValidation.valid) {
                    console.error('Schema validation failed:');
                    schemaValidation.errors.forEach(error => console.error(`  - ${error}`));
                    process.exit(1);
                }

                console.log('\x1b[32m✓\x1b[0m Schema validation passed');

                if (!workflow.name) {
                    console.log('Warning: Workflow has no name');
                } 
                else {
                    console.log(`Workflow name: ${workflow.name}`);
                }

                if (!workflow.on) {
                    console.log('Warning: Workflow has no triggers defined');
                } 
                else {
                    console.log(`Triggers: ${Object.keys(workflow.on).join(', ')}`);
                }

                if (!workflow.jobs || Object.keys(workflow.jobs).length === 0) {
                    console.log('Warning: Workflow has no jobs defined');
                } 
                else {
                    console.log(`Jobs: ${Object.keys(workflow.jobs).join(', ')}`);
                }

                // Calculate working directory (repository root)
                const workflowDir = path.dirname(path.resolve(workflowFile));
                const workflowsDir = path.dirname(workflowDir); // Go up from workflows to .github
                const workingDir = path.basename(workflowsDir) === '.github'
                    ? path.dirname(workflowsDir) // Go up from .github to repo root
                    : workflowDir; // Fallback to workflow file's directory

                console.log(`Repository root: ${workingDir}`);

                // Get workflow-level defaults
                const workflowDefaults = workflow.defaults || {};
                const workflowRunDefaults = workflowDefaults.run || {};
                const workflowWorkingDir = workflowRunDefaults['working-directory'];

                // Run the workflow.
                const isDryRun = options.dryRun || false;
                if (isDryRun) {
                    console.log('\nStarting workflow (PREVIEW MODE)...');
                } 
                else {
                    console.log('\nStarting workflow...');
                }
                await runWorkflow(workflow, isDryRun, workingDir, workflowWorkingDir);

            } 
            catch (yamlError: any) {
                console.error('YAML validation failed:');
                console.error(yamlError.message);
                process.exit(1);
            }

        } 
        catch (error: any) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    });

async function runWorkflow(workflow: any, isDryRun: boolean = false, workingDir: string = process.cwd(), workflowWorkingDir?: string) {
    const jobs = workflow.jobs || {};
    const jobNames = Object.keys(jobs);

    if (jobNames.length === 0) {
        console.log('No jobs to run');
        return;
    }

    // Flag to track if we're in "run all" mode
    let runAllMode = false;

    for (const jobName of jobNames) {
        const job = jobs[jobName];
        console.log(`\n\x1b[97mRunning job: ${jobName}\x1b[0m`);

        if (job['runs-on']) {
            console.log(`  Runs on: ${job['runs-on']}`);
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

                console.log(`    \x1b[97m${i + 1}. ${stepName} (${stepUses})\x1b[0m`);

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

                    // Resolve variables in the command
                    const resolvedCommand = await resolveVariablesInCommand(step.run, workflow);

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
                                const result = await executeCommand(resolvedCommand, stepWorkingDir, true);

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
                        await handleTerraformSetup(step, isDryRun, workflow, stepWorkingDir);
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

        console.log(`  \x1b[32m✓\x1b[0m Job '${jobName}' completed`);
    }
}

// Show help if no arguments provided
if (process.argv.length < 3) {
    program.help();
}

program.parse();
