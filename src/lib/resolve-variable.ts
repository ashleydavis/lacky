import { Workflow } from '../types/workflow';
import { askUserForInput, askUserForSecret, askUserToSelectFromMenu } from './input';
import { WorkflowContext } from './context';

// Define known GitHub context variables with their valid options
const GITHUB_CONTEXT_OPTIONS: Record<string, string[]> = {
    'github.ref_type': ['branch', 'tag'],
    'github.event_name': ['push', 'pull_request', 'workflow_dispatch', 'schedule', 'release', 'create', 'delete'],
};

export function extractGitHubExpressions(text: string): string[] {
    const expressionRegex = /\$\{\{\s*([^}]+)\s*\}\}/g;
    const expressions: string[] = [];
    let match;

    while ((match = expressionRegex.exec(text)) !== null) {
        expressions.push(match[1].trim());
    }

    return expressions;
}

export async function resolveGitHubExpression(expression: string, workflow: Workflow, context: WorkflowContext): Promise<string> {
    // Check if we already have this value
    if (context.resolvedVariables.has(expression)) {
        return context.resolvedVariables.get(expression)!;
    }

    // Check if this is a known GitHub context variable with predefined options
    if (GITHUB_CONTEXT_OPTIONS[expression]) {
        const value = await askUserToSelectFromMenu(
            `Select value for '${expression}':`,
            GITHUB_CONTEXT_OPTIONS[expression]
        );
        context.resolvedVariables.set(expression, value);
        console.log(`  • Resolved ${expression} = "${value}"`);
        return value;
    }

    // Handle different types of expressions
    if (expression.startsWith('github.event.inputs.')) {
        const inputName = expression.replace('github.event.inputs.', '');
        const value = await askUserForInput(`Enter value for input '${inputName}'`, 'my-value');
        context.resolvedVariables.set(expression, value);
        console.log(`  • Resolved ${expression} = "${value}"`);
        return value;
    }

    // Handle secrets (e.g., secrets.ECR_GITHUB_TOKEN)
    if (expression.startsWith('secrets.')) {
        const secretName = expression.replace('secrets.', '');
        const value = await askUserForSecret(`Enter value for secret '${secretName}'`);
        context.resolvedVariables.set(expression, value);
        console.log(`  • Resolved ${expression} = "***"`); // Don't display the actual secret value
        return value;
    }

    if (expression.startsWith('env.')) {
        const envVarName = expression.replace('env.', '');

        // Check if this env var is defined in the workflow
        if (workflow?.env && workflow.env[envVarName]) {
            const value = workflow.env[envVarName];
            context.resolvedVariables.set(expression, value);
            console.log(`  • Resolved ${expression} = "${value}"`);
            return value;
        }

        // If not in workflow, ask user
        const value = await askUserForInput(`Enter value for environment variable '${envVarName}'`, 'value');
        context.resolvedVariables.set(expression, value);
        console.log(`  • Resolved ${expression} = "${value}"`);
        return value;
    }

    if (expression.startsWith('github.ref_name')) {
        const value = await askUserForInput('Enter branch/tag name', 'main');
        context.resolvedVariables.set(expression, value);
        console.log(`  • Resolved ${expression} = "${value}"`);
        return value;
    }

    if (expression.startsWith('github.sha')) {
        const value = await askUserForInput('Enter commit SHA', 'abc123def456');
        context.resolvedVariables.set(expression, value);
        console.log(`  • Resolved ${expression} = "${value}"`);
        return value;
    }

    if (expression.startsWith('github.workspace')) {
        const value = await askUserForInput('Enter workspace path', '/home/runner/work/repo/repo');
        context.resolvedVariables.set(expression, value);
        console.log(`  • Resolved ${expression} = "${value}"`);
        return value;
    }

    // Handle fromJSON function calls (e.g., fromJSON(needs.validate.outputs.files))
    if (expression.includes('fromJSON(') && expression.includes(')')) {
        const fromJSONMatch = expression.match(/fromJSON\(([^)]+)\)/);
        if (fromJSONMatch) {
            const innerExpression = fromJSONMatch[1];
            const resolvedInner = await resolveGitHubExpression(innerExpression, workflow, context);
            try {
                const parsed = JSON.parse(resolvedInner);
                console.log(`  • Resolved fromJSON(${innerExpression}) = ${JSON.stringify(parsed)}`);
                return JSON.stringify(parsed);
            } catch {
                console.log(`  • Resolved fromJSON(${innerExpression}) = "${resolvedInner}"`);
                return resolvedInner;
            }
        }
    }

    // Handle job output references (e.g., needs.validate.outputs.files)
    if (expression.startsWith('needs.') || expression.includes('needs.')) {
        const match = expression.match(/needs\.([^.]+)\.outputs\.(.+)/);
        if (match) {
            const [, jobName, outputName] = match;
            if (context.jobOutputs.has(jobName) && context.jobOutputs.get(jobName)!.has(outputName)) {
                const value = context.jobOutputs.get(jobName)!.get(outputName)!;
                console.log(`  • Using job output: ${jobName}.${outputName} = "${value}"`);
                return value;
            }
            // If job output not found, ask user
            const value = await askUserForInput(`Enter value for job output '${expression}'`, 'output-value');
            context.resolvedVariables.set(expression, value);
            console.log(`  • Resolved ${expression} = "${value}"`);
            return value;
        }
    }

    // For other expressions, ask the user
    const value = await askUserForInput(`Enter value for '${expression}'`, 'value');
    context.resolvedVariables.set(expression, value);
    console.log(`      🔧 Resolved ${expression} = "${value}"`);
    return value;
}

export async function resolveVariablesInCommand(command: string, workflow: Workflow, stepId: string, jobName: string, context: WorkflowContext, matrixValue?: any): Promise<string> {
    const expressions = extractGitHubExpressions(command);
    if (expressions.length === 0) {
        return command;
    }

    let resolvedCommand = command;
    for (const expression of expressions) {
        let value: string;
        
        // Check if this is a matrix variable reference (e.g., matrix.filename)
        if (expression.startsWith('matrix.') && matrixValue) {
            const matrixKey = expression.replace('matrix.', '');
            if (matrixValue.hasOwnProperty(matrixKey)) {
                value = String(matrixValue[matrixKey]);
                console.log(`  • Resolved ${expression} = "${value}"`);
            } else {
                value = await askUserForInput(`Enter value for matrix variable '${expression}'`, 'matrix-value');
            }
        }
        // Check if this is a step output reference (e.g., steps.changed-files.outputs.all_changed_files)
        else if (expression.startsWith('steps.') && expression.includes('.outputs.')) {
            value = await resolveStepOutput(expression, stepId, jobName, context);
            // Log the step output reference
            const match = expression.match(/^steps\.([^.]+)\.outputs\.(.+)$/);
            if (match) {
                const [, sourceStepId, outputName] = match;
                console.log(`  • Using step output: ${sourceStepId}.${outputName} = "${value}"`);
            }
        } else {
            value = await resolveGitHubExpression(expression, workflow, context);
        }
        
        const placeholder = '${{ ' + expression + ' }}';
        resolvedCommand = resolvedCommand.replace(placeholder, value);
    }

    return resolvedCommand;
}

export async function resolveStepOutput(expression: string, currentStepId: string, currentJobName: string, context: WorkflowContext): Promise<string> {
    // Parse step output reference: steps.step-id.outputs.output-name
    const match = expression.match(/^steps\.([^.]+)\.outputs\.(.+)$/);
    if (!match) {
        return await askUserForInput(`Enter value for step output '${expression}'`, 'output-value');
    }
    
    const [, stepId, outputName] = match;
    
    // Check if we have the output stored in the current job
    if (context.stepOutputs.has(currentJobName) && 
        context.stepOutputs.get(currentJobName)!.has(stepId) && 
        context.stepOutputs.get(currentJobName)!.get(stepId)!.has(outputName)) {
        return context.stepOutputs.get(currentJobName)!.get(stepId)!.get(outputName)!;
    }
    
    // If not found, ask user for the value
    return await askUserForInput(`Enter value for step output '${expression}'`, 'output-value');
}

export async function resolveJobOutputExpression(expression: string, jobName: string, workflow: Workflow, context: WorkflowContext): Promise<string> {
    // Check if this is a step output reference (e.g., ${{ steps.set-matrix.outputs.files }})
    if (expression.includes('steps.') && expression.includes('.outputs.')) {
        const match = expression.match(/\$?\{\{\s*steps\.([^.]+)\.outputs\.(.+?)\s*\}\}/);
        if (match) {
            const [, stepId, outputName] = match;
            
            
            // Check if we have the output stored in the current job
            if (context.stepOutputs.has(jobName) && 
                context.stepOutputs.get(jobName)!.has(stepId) && 
                context.stepOutputs.get(jobName)!.get(stepId)!.has(outputName)) {
                const value = context.stepOutputs.get(jobName)!.get(stepId)!.get(outputName)!;
                console.log(`  • Using step output for job output: ${stepId}.${outputName} = "${value}"`);
                return value;
            }
        }
        
        // If not found, ask user for the value
        return await askUserForInput(`Enter value for step output '${expression}'`, 'output-value');
    }
    
    // For other expressions, use the regular GitHub expression resolver
    return await resolveGitHubExpression(expression, workflow, context);
}
