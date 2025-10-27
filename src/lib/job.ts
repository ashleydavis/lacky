import { Workflow } from '../types/workflow';
import { extractGitHubExpressions, resolveGitHubExpression } from './resolve-variable';
import { WorkflowContext } from './context';

export async function evaluateJobCondition(condition: string, workflow: Workflow, context: WorkflowContext): Promise<boolean> {
    if (!condition) return true;
    
    // Replace job output references with their actual values
    let resolvedCondition = condition;
    
    // Find all job output references in the condition
    const jobOutputMatches = condition.match(/needs\.([^.]+)\.outputs\.([^.]+?)(?:\s|$|==|!=|>|<|>=|<=)/g);
    if (jobOutputMatches) {
        for (const match of jobOutputMatches) {
            const jobOutputMatch = match.match(/needs\.([^.]+)\.outputs\.([^.]+?)(?:\s|$|==|!=|>|<|>=|<=)/);
            if (jobOutputMatch) {
                const [, jobName, outputName] = jobOutputMatch;
                
                // Check if we have the output stored
                if (context.jobOutputs.has(jobName) && context.jobOutputs.get(jobName)!.has(outputName)) {
                    const value = context.jobOutputs.get(jobName)!.get(outputName)!;
                    // Replace the job output reference with the actual value
                    resolvedCondition = resolvedCondition.replace(match, `"${value}"`);
                } else {
                    console.log(`      ⚠️  Job condition references unknown job output: ${jobName}.${outputName}`);
                    return false;
                }
            }
        }
    }
    
    // Replace needs.job.result references
    const needsResultMatches = condition.match(/needs\.([^.]+)\.result/g);
    if (needsResultMatches) {
        for (const match of needsResultMatches) {
            const needsMatch = match.match(/needs\.([^.]+)\.result/);
            if (needsMatch) {
                const [, jobName] = needsMatch;
                // For now, assume all completed jobs succeeded
                // In a real implementation, we'd track job results
                resolvedCondition = resolvedCondition.replace(match, `"success"`);
            }
        }
    }
    
    // Replace other GitHub expressions
    const githubExpressions = extractGitHubExpressions(resolvedCondition);
    for (const expression of githubExpressions) {
        const value = await resolveGitHubExpression(expression, workflow, context);
        const placeholder = '${{ ' + expression + ' }}';
        resolvedCondition = resolvedCondition.replace(placeholder, `"${value}"`);
    }
    
    // Define GitHub Actions workflow functions
    const always = () => true;
    const success = () => true;
    const failure = () => false;
    const cancelled = () => false;
    
    // Evaluate the resolved condition as a JavaScript expression
    try {
        const result = eval(resolvedCondition);
        return Boolean(result);
    } catch (error) {
        console.log(`      ⚠️  Error evaluating job condition: ${error}`);
        return false;
    }
}

export async function evaluateStepCondition(condition: string, workflow: Workflow, jobName: string, context: WorkflowContext): Promise<boolean> {
    if (!condition) return true;
    
    // Replace step output references with their actual values
    let resolvedCondition = condition;
    
    // Find all step output references in the condition
    const stepOutputMatches = condition.match(/steps\.([^.]+)\.outputs\.([^.]+?)(?:\s|$|==|!=|>|<|>=|<=)/g);
    if (stepOutputMatches) {
        for (const match of stepOutputMatches) {
            const stepOutputMatch = match.match(/steps\.([^.]+)\.outputs\.([^.]+?)(?:\s|$|==|!=|>|<|>=|<=)/);
            if (stepOutputMatch) {
                const [, stepId, outputName] = stepOutputMatch;
                
                
                // Check if we have the output stored in the current job
                if (context.stepOutputs.has(jobName) && 
                    context.stepOutputs.get(jobName)!.has(stepId) && 
                    context.stepOutputs.get(jobName)!.get(stepId)!.has(outputName)) {
                    const value = context.stepOutputs.get(jobName)!.get(stepId)!.get(outputName)!;
                    // Replace the step output reference with the actual value
                    resolvedCondition = resolvedCondition.replace(match, `"${value}"`);
                } else {
                    console.log(`      ⚠️  Step condition references unknown step output: ${stepId}.${outputName}`);
                    return false;
                }
            }
        }
    }
    
    // Replace other GitHub expressions
    const githubExpressions = extractGitHubExpressions(resolvedCondition);
    for (const expression of githubExpressions) {
        const value = await resolveGitHubExpression(expression, workflow, context);
        const placeholder = '${{ ' + expression + ' }}';
        resolvedCondition = resolvedCondition.replace(placeholder, `"${value}"`);
    }
    
    // Define GitHub Actions workflow functions
    const always = () => true;
    const success = () => true;
    const failure = () => false;
    const cancelled = () => false;
    
    // Evaluate the resolved condition as a JavaScript expression
    try {
        const result = eval(resolvedCondition);
        return Boolean(result);
    } catch (error) {
        console.log(`      ⚠️  Error evaluating condition: ${error}`);
        return false;
    }
}
