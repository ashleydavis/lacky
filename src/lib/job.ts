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
        // Check if this expression contains a function call (e.g., startsWith(...))
        const functionCallMatch = expression.match(/^(\w+)\((.*)\)$/);
        if (functionCallMatch) {
            // This is a function call, we'll handle it during eval
            // Just replace the ${{ }} wrapper and keep the function call
            const placeholder = '${{ ' + expression + ' }}';
            resolvedCondition = resolvedCondition.replace(placeholder, expression);
        } else {
            // Regular expression, resolve it normally
            const value = await resolveGitHubExpression(expression, workflow, context);
            const placeholder = '${{ ' + expression + ' }}';
            resolvedCondition = resolvedCondition.replace(placeholder, `"${value}"`);
        }
    }
    
    // Now resolve any remaining GitHub expressions that might be inside function calls
    // (e.g., github.event.release.tag_name inside startsWith(...))
    const remainingExpressions = extractGitHubExpressions(resolvedCondition);
    for (const expression of remainingExpressions) {
        const value = await resolveGitHubExpression(expression, workflow, context);
        const placeholder = '${{ ' + expression + ' }}';
        resolvedCondition = resolvedCondition.replace(placeholder, `"${value}"`);
    }
    
    // Also handle GitHub expressions without ${{ }} wrapper (direct references in function calls)
    // Match patterns like github.event.release.tag_name (not wrapped in ${{ }})
    const directGitHubRefs = resolvedCondition.match(/\bgithub\.\w+(?:\.[\w]+)*/g);
    if (directGitHubRefs) {
        for (const ref of directGitHubRefs) {
            // Only resolve if it's not already a string literal
            if (!resolvedCondition.includes(`"${ref}"`)) {
                const value = await resolveGitHubExpression(ref, workflow, context);
                // Replace the reference, being careful not to replace parts of other strings
                const regex = new RegExp(`\\b${ref.replace(/\./g, '\\.')}\\b`, 'g');
                resolvedCondition = resolvedCondition.replace(regex, `"${value}"`);
            }
        }
    }
    
    // Define GitHub Actions workflow functions
    const always = () => true;
    const success = () => true;
    const failure = () => false;
    const cancelled = () => false;
    
    // Define GitHub Actions string utility functions
    const startsWith = (str: string, searchString: string): boolean => {
        if (typeof str !== 'string' || typeof searchString !== 'string') return false;
        return str.startsWith(searchString);
    };
    
    const endsWith = (str: string, searchString: string): boolean => {
        if (typeof str !== 'string' || typeof searchString !== 'string') return false;
        return str.endsWith(searchString);
    };
    
    const contains = (str: string, searchString: string): boolean => {
        if (typeof str !== 'string' || typeof searchString !== 'string') return false;
        return str.includes(searchString);
    };
    
    // Evaluate the resolved condition as a JavaScript expression
    // Note: These functions need to be in scope for eval to access them
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
        // Check if this expression contains a function call (e.g., startsWith(...))
        const functionCallMatch = expression.match(/^(\w+)\((.*)\)$/);
        if (functionCallMatch) {
            // This is a function call, we'll handle it during eval
            // Just replace the ${{ }} wrapper and keep the function call
            const placeholder = '${{ ' + expression + ' }}';
            resolvedCondition = resolvedCondition.replace(placeholder, expression);
        } else {
            // Regular expression, resolve it normally
            const value = await resolveGitHubExpression(expression, workflow, context);
            const placeholder = '${{ ' + expression + ' }}';
            resolvedCondition = resolvedCondition.replace(placeholder, `"${value}"`);
        }
    }
    
    // Now resolve any remaining GitHub expressions that might be inside function calls
    // (e.g., github.event.release.tag_name inside startsWith(...))
    const remainingExpressions = extractGitHubExpressions(resolvedCondition);
    for (const expression of remainingExpressions) {
        const value = await resolveGitHubExpression(expression, workflow, context);
        const placeholder = '${{ ' + expression + ' }}';
        resolvedCondition = resolvedCondition.replace(placeholder, `"${value}"`);
    }
    
    // Also handle GitHub expressions without ${{ }} wrapper (direct references in function calls)
    // Match patterns like github.event.release.tag_name (not wrapped in ${{ }})
    const directGitHubRefs = resolvedCondition.match(/\bgithub\.\w+(?:\.[\w]+)*/g);
    if (directGitHubRefs) {
        for (const ref of directGitHubRefs) {
            // Only resolve if it's not already a string literal
            if (!resolvedCondition.includes(`"${ref}"`)) {
                const value = await resolveGitHubExpression(ref, workflow, context);
                // Replace the reference, being careful not to replace parts of other strings
                const regex = new RegExp(`\\b${ref.replace(/\./g, '\\.')}\\b`, 'g');
                resolvedCondition = resolvedCondition.replace(regex, `"${value}"`);
            }
        }
    }
    
    // Define GitHub Actions workflow functions
    const always = () => true;
    const success = () => true;
    const failure = () => false;
    const cancelled = () => false;
    
    // Define GitHub Actions string utility functions
    const startsWith = (str: string, searchString: string): boolean => {
        if (typeof str !== 'string' || typeof searchString !== 'string') return false;
        return str.startsWith(searchString);
    };
    
    const endsWith = (str: string, searchString: string): boolean => {
        if (typeof str !== 'string' || typeof searchString !== 'string') return false;
        return str.endsWith(searchString);
    };
    
    const contains = (str: string, searchString: string): boolean => {
        if (typeof str !== 'string' || typeof searchString !== 'string') return false;
        return str.includes(searchString);
    };
    
    // Evaluate the resolved condition as a JavaScript expression
    // Note: These functions need to be in scope for eval to access them
    try {
        const result = eval(resolvedCondition);
        return Boolean(result);
    } catch (error) {
        console.log(`      ⚠️  Error evaluating condition: ${error}`);
        return false;
    }
}
