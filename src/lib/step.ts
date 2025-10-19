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

export async function handleTerraformSetup(step: Step, isDryRun: boolean, workflow: Workflow, workingDir: string, jobName: string, context: WorkflowContext): Promise<void> {
    console.log(`      Setting up Terraform...`);

    // Extract terraform_version from step.with
    const terraformVersion = step.with?.['terraform_version'];

    if (!terraformVersion) {
        console.log(`      ⚠️  Warning: No terraform_version specified in setup-terraform action`);
        return;
    }

    // Resolve any variables in the version
    const resolvedVersion = await resolveVariablesInCommand(terraformVersion, workflow, 'terraform-setup', jobName, context);

    console.log(`      Required Terraform version: ${resolvedVersion}`);

    if (isDryRun) {
        console.log(`      [PREVIEW] Would check local Terraform version against ${resolvedVersion}`);
        return;
    }

    // Check local Terraform version
    try {
        const terraformWorkingDir = workingDir || process.cwd();
        console.log(`      Checking Terraform version in: ${terraformWorkingDir}`);

        await checkTerraformVersion(resolvedVersion, terraformWorkingDir, context.miseVersion);

    } 
    catch (error: any) {
        console.log(`      ✖ Error checking Terraform version: ${error.message}`);
        process.exit(1);
    }
}

export async function handleAction(step: Step, isDryRun: boolean, workflow: Workflow, workingDir: string, stepId: string, workflowFile: string, jobName: string, context: WorkflowContext): Promise<void> {
    const actionName = step.uses;
    if (!actionName) {
        console.log(`      ⚠️  Warning: Step has no 'uses' property`);
        return;
    }
    console.log(`      Running action: ${actionName}...`);

    if (isDryRun) {
        console.log(`      [PREVIEW] Would run action ${actionName}`);
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
    
    console.log(`      🔍 Looking for mock at: ${mockFilePath}`);
    
    if (!fs.existsSync(mocksDir)) {
        console.log(`      ℹ️  No mock directory found for ${actionNameWithoutVersion} - action will run normally`);
        console.log(`      Expected directory: ${mocksDir}`);
        console.log(`      To create a mock, add: ${mockFilePath}`);
        return;
    }

    if (!fs.existsSync(mockFilePath)) {
        console.log(`      ℹ️  No mock file found for ${actionNameWithoutVersion} - action will run normally`);
        console.log(`      Expected file: ${mockFilePath}`);
        return;
    }

    try {
        console.log(`      Loading mock from: ${mockFilePath}`);
        
        // Clear require cache to allow hot reloading of mocks
        delete require.cache[require.resolve(mockFilePath)];
        
        // Require the mock file
        const mockModule = require(mockFilePath);
        
        // The mock file exports a function directly
        const mockFunction = mockModule;
        
        if (typeof mockFunction !== 'function') {
            console.log(`      ⚠️  Warning: Mock file for ${actionNameWithoutVersion} does not export a function`);
            console.log(`      Mock file location: ${mockFilePath}`);
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
                console.log(`      [OUTPUT] ${key} = "${value}"`);
            }
        }

        console.log(`      ✓ Action ${actionNameWithoutVersion} completed successfully with mock`);
        
    } catch (error: any) {
        console.log(`      ✖ Error running mock for ${actionNameWithoutVersion}: ${error.message}`);
        console.log(`      Mock file location: ${mockFilePath}`);
        console.log(`      Stack trace: ${error.stack}`);
    }
}

