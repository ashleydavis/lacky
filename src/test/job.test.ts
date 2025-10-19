import { evaluateJobCondition, evaluateStepCondition } from '../lib/job';
import { createWorkflowContext } from '../lib/context';
import { Workflow } from '../types/workflow';

// Mock the index module
jest.mock('../index', () => ({
    jobOutputs: new Map(),
    stepOutputs: new Map(),
    extractGitHubExpressions: jest.fn(() => []),
    resolveGitHubExpression: jest.fn()
}));

describe('Job Functions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('evaluateJobCondition', () => {
        it('should return true for empty condition', async () => {
            const mockWorkflow: Workflow = {
                name: 'Test Workflow',
                on: { push: {} },
                jobs: {}
            };

            const result = await evaluateJobCondition('', mockWorkflow, createWorkflowContext());
            expect(result).toBe(true);
        });

        it('should evaluate job condition with job outputs', async () => {
            const mockWorkflow: Workflow = {
                name: 'Test Workflow',
                on: { push: {} },
                jobs: {}
            };

            const context = createWorkflowContext();
            context.jobOutputs.set('test-job', new Map([['test-output', 'test-value']]));

            const result = await evaluateJobCondition('needs.test-job.outputs.test-output == "test-value"', mockWorkflow, context);
            expect(result).toBe(true);
        });
    });

    describe('evaluateStepCondition', () => {
        it('should return true for empty condition', async () => {
            const mockWorkflow: Workflow = {
                name: 'Test Workflow',
                on: { push: {} },
                jobs: {}
            };

            const result = await evaluateStepCondition('', mockWorkflow, 'test-job', createWorkflowContext());
            expect(result).toBe(true);
        });

        it('should evaluate step condition with step outputs', async () => {
            const mockWorkflow: Workflow = {
                name: 'Test Workflow',
                on: { push: {} },
                jobs: {}
            };

            const context = createWorkflowContext();
            const jobMap = new Map();
            const stepMap = new Map([['test-output', 'test-value']]);
            jobMap.set('test-step', stepMap);
            context.stepOutputs.set('test-job', jobMap);

            const result = await evaluateStepCondition('steps.test-step.outputs.test-output == "test-value"', mockWorkflow, 'test-job', context);
            expect(result).toBe(true);
        });
    });
});
