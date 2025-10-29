#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import pc from 'picocolors';
import { validateWorkflowSchema, runWorkflow } from './lib/workflow';
import { checkMiseInstallation } from './lib/tools';
import { createWorkflowContext } from './lib/context';
import packageJson from '../package.json';

async function processWorkflowFile(workflowFile: string, isDryRun: boolean, showFullOutput: boolean, truncateLines: number): Promise<void> {
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
    console.log(`Reading workflow file: ${pc.cyan(workflowFile)}`);
    const fileContent = fs.readFileSync(workflowFile, 'utf8');

    try {
        const workflow = yaml.load(fileContent) as any;
        console.log(pc.green('✓ YAML syntax is valid'));

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

        console.log(pc.green('✓ Schema validation passed'));

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

        console.log(`Repository root: ${pc.cyan(workingDir)}`);

        // Run the workflow.
        const context = createWorkflowContext(miseVersion);
        await runWorkflow(workflow, isDryRun, workingDir, workflowFile, context, showFullOutput, truncateLines);

    } 
    catch (yamlError: any) {
        console.error('YAML validation failed:');
        console.error(yamlError.message);
        process.exit(1);
    }
}

const program = new Command();
program
    .name('lacky')
    .description('A CLI tool to run a GitHub Actions Workflow locally')
    .version(packageJson.version)
    .argument('<workflow-file>', 'Path to the GitHub workflow YAML file')
    .option('-d, --dry-run', 'Show what commands would be executed without running them (preview)')
    .option('-f, --full', 'Show full command output without truncation')
    .option('-l, --lines <number>', 'Number of lines to show at start and end of truncated output', '10')
    .action(async (workflowFile, options) => {
        try {
            const isDryRun = options.dryRun || false;
            const showFullOutput = options.full || false;
            const truncateLines = parseInt(options.lines, 10);
            await processWorkflowFile(workflowFile, isDryRun, showFullOutput, truncateLines);
        } 
        catch (error: any) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    });

// Only run CLI code when this file is executed directly
if (require.main === module) {
    // Show help if no arguments provided
    if (process.argv.length < 3) {
        program.help();
    }

    program.parse();
}
