// Workflow execution context containing all state
export interface WorkflowContext {
    resolvedVariables: Map<string, string>;
    stepOutputs: Map<string, Map<string, Map<string, string>>>; // jobName -> stepId -> outputName -> outputValue
    jobOutputs: Map<string, Map<string, string>>; // jobName -> outputName -> outputValue
    miseVersion?: string | null;
}

// Create a new workflow context
export function createWorkflowContext(miseVersion?: string | null): WorkflowContext {
    return {
        resolvedVariables: new Map<string, string>(),
        stepOutputs: new Map<string, Map<string, Map<string, string>>>(),
        jobOutputs: new Map<string, Map<string, string>>(),
        miseVersion
    };
}
