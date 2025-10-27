import { Step, Workflow } from '../types/workflow';
import { resolveVariablesInCommand } from './resolve-variable';
import { WorkflowContext } from './context';
import { executeCommand } from './command';
import { GITHUB_ENV_VARS } from './shared';
import * as path from 'path';
import * as fs from 'fs';

export async function checkTerraformVersion(resolvedVersion: string, terraformWorkingDir: string, miseVersion?: string | null): Promise<void> {
    // Use executeCommand which will run in the local shell and pick up mise environment
    const result = await executeCommand('terraform version -json', terraformWorkingDir, false, GITHUB_ENV_VARS, miseVersion);

    if (!result.success) {
        console.log(`\x1b[90m✖ Failed to get local Terraform version: ${result.error}\x1b[0m`);
        console.log(`\x1b[90mPlease ensure Terraform is installed and available in PATH\x1b[0m`);
        throw new Error(`Failed to get local Terraform version: ${result.error}`);
    }

    // Parse the JSON output to get version
    const versionInfo = JSON.parse(result.output);
    const localVersion = versionInfo.terraform_version;

    console.log(`\x1b[90mLocal Terraform version: ${localVersion}\x1b[0m`);

    // Compare versions (handle version strings like "1.5.0" vs "1.5.0+ent")
    const normalizedRequired = resolvedVersion.replace(/[^0-9.]/g, '');
    const normalizedLocal = localVersion.replace(/[^0-9.]/g, '');

    if (normalizedLocal !== normalizedRequired) {
        console.log(`\x1b[90m✖ Terraform version mismatch!\x1b[0m`);
        console.log(`\x1b[90mRequired: ${resolvedVersion}\x1b[0m`);
        console.log(`\x1b[90mLocal: ${localVersion}\x1b[0m`);
        console.log(`\x1b[90mPlease install the correct Terraform version or update the workflow\x1b[0m`);
        throw new Error(`Terraform version mismatch! Required: ${resolvedVersion}, Local: ${localVersion}`);
    }

    console.log(`\x1b[32m✓ Terraform version matches (${localVersion})\x1b[0m`);
}

export async function handleTerraformSetup(step: Step, isDryRun: boolean, workflow: Workflow, workingDir: string, jobName: string, context: WorkflowContext): Promise<void> {
    console.log(`\x1b[90mSetting up Terraform...\x1b[0m`);

    // Extract terraform_version from step.with
    const terraformVersion = step.with?.['terraform_version'];

    if (!terraformVersion) {
        console.log(`\x1b[90m⚠️  Warning: No terraform_version specified in setup-terraform action\x1b[0m`);
        return;
    }

    // Resolve any variables in the version
    const resolvedVersion = await resolveVariablesInCommand(terraformVersion, workflow, 'terraform-setup', jobName, context);

    console.log(`\x1b[90mRequired Terraform version: ${resolvedVersion}\x1b[0m`);

    if (isDryRun) {
        console.log(`\x1b[90m[PREVIEW] Would check local Terraform version against ${resolvedVersion}\x1b[0m`);
        return;
    }

    // Check local Terraform version
    try {
        const terraformWorkingDir = workingDir || process.cwd();
        console.log(`\x1b[90mChecking Terraform version in: ${terraformWorkingDir}\x1b[0m`);

        await checkTerraformVersion(resolvedVersion, terraformWorkingDir, context.miseVersion);

    } 
    catch (error: any) {
        console.log(`\x1b[90m✖ Error checking Terraform version: ${error.message}\x1b[0m`);
        throw error;
    }
}

export async function handleAction(step: Step, isDryRun: boolean, workflow: Workflow, workingDir: string, stepId: string, workflowFile: string, jobName: string, context: WorkflowContext): Promise<void> {
    const actionName = step.uses;
    if (!actionName) {
        console.log(`\x1b[90m⚠️  Warning: Step has no 'uses' property\x1b[0m`);
        return;
    }
    console.log(`\x1b[90mRunning action: ${actionName}...\x1b[0m`);

    if (isDryRun) {
        console.log(`\x1b[90m[PREVIEW] Would run action ${actionName}\x1b[0m`);
        return;
    }


    // Extract workflow name from file path
    const workflowName = path.basename(workflowFile, path.extname(workflowFile));
    
    // Look for mock directory: {workflow-directory}/mocks/{workflow-name}/
    const workflowDir = path.dirname(path.resolve(workflowFile));
    const mocksDir = path.join(workflowDir, 'mocks', workflowName);
    
    // Strip version information from action name (e.g., "tj-actions/changed-files@v41" -> "tj-actions/changed-files")
    const actionNameWithoutVersion = actionName.split('@')[0];
    
    // Convert action name to mock file name (e.g., "tj-actions/changed-files" -> "tj-actions-changed-files.js")
    const mockFileName = actionNameWithoutVersion.replace('/', '-') + '.js';
    const mockFilePath = path.join(mocksDir, mockFileName);
    
    console.log(`\x1b[90m🔍 Looking for mock at: ${mockFilePath}\x1b[0m`);
    
    if (!fs.existsSync(mocksDir)) {
        console.log(`\x1b[90mℹ️  No mock directory found for ${actionNameWithoutVersion} - action will run normally\x1b[0m`);
        console.log(`\x1b[90mExpected directory: ${mocksDir}\x1b[0m`);
        console.log(`\x1b[90mTo create a mock, add: ${mockFilePath}\x1b[0m`);
        return;
    }

    if (!fs.existsSync(mockFilePath)) {
        console.log(`\x1b[90mℹ️  No mock file found for ${actionNameWithoutVersion} - action will run normally\x1b[0m`);
        console.log(`\x1b[90mExpected file: ${mockFilePath}\x1b[0m`);
        return;
    }

    try {
        console.log(`\x1b[90mLoading mock from: ${mockFilePath}\x1b[0m`);
        
        // Clear require cache to allow hot reloading of mocks
        delete require.cache[require.resolve(mockFilePath)];
        
        // Require the mock file
        const mockModule = require(mockFilePath);
        
        // The mock file exports a function directly
        const mockFunction = mockModule;
        
        if (typeof mockFunction !== 'function') {
            console.log(`\x1b[90m⚠️  Warning: Mock file for ${actionNameWithoutVersion} does not export a function\x1b[0m`);
            console.log(`\x1b[90mMock file location: ${mockFilePath}\x1b[0m`);
            return;
        }

        // Call the mock function with step context
        const mockOutputs = await mockFunction({
            step,
            workflow,
            workingDir,
            stepId,
            isDryRun
        });

        // Store the outputs for use by subsequent steps
        if (mockOutputs && typeof mockOutputs === 'object') {
            if (!context.stepOutputs.has(jobName)) {
                context.stepOutputs.set(jobName, new Map());
            }
            if (!context.stepOutputs.get(jobName)!.has(stepId)) {
                context.stepOutputs.get(jobName)!.set(stepId, new Map());
            }
            
            for (const [key, value] of Object.entries(mockOutputs)) {
                context.stepOutputs.get(jobName)!.get(stepId)!.set(key, String(value));
                console.log(`\x1b[90m[OUTPUT] ${key} = "${value}"\x1b[0m`);
            }
        }

        console.log(`\x1b[32m✓ Action ${actionNameWithoutVersion} completed successfully with mock\x1b[0m`);
        
    } catch (error: any) {
        console.log(`\x1b[90m✖ Error running mock for ${actionNameWithoutVersion}: ${error.message}\x1b[0m`);
        console.log(`\x1b[90mMock file location: ${mockFilePath}\x1b[0m`);
        console.log(`\x1b[90mStack trace: ${error.stack}\x1b[0m`);
    }
}

