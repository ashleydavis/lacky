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

        it('should support always() function', async () => {
            const mockWorkflow: Workflow = {
                name: 'Test Workflow',
                on: { push: {} },
                jobs: {}
            };

            const result = await evaluateJobCondition('always()', mockWorkflow, createWorkflowContext());
            expect(result).toBe(true);
        });

        it('should support success() function', async () => {
            const mockWorkflow: Workflow = {
                name: 'Test Workflow',
                on: { push: {} },
                jobs: {}
            };

            const result = await evaluateJobCondition('success()', mockWorkflow, createWorkflowContext());
            expect(result).toBe(true);
        });

        it('should support failure() function', async () => {
            const mockWorkflow: Workflow = {
                name: 'Test Workflow',
                on: { push: {} },
                jobs: {}
            };

            const result = await evaluateJobCondition('failure()', mockWorkflow, createWorkflowContext());
            expect(result).toBe(false);
        });

        it('should support cancelled() function', async () => {
            const mockWorkflow: Workflow = {
                name: 'Test Workflow',
                on: { push: {} },
                jobs: {}
            };

            const result = await evaluateJobCondition('cancelled()', mockWorkflow, createWorkflowContext());
            expect(result).toBe(false);
        });

        it('should support complex conditions with always() and other expressions', async () => {
            const mockWorkflow: Workflow = {
                name: 'Test Workflow',
                on: { push: {} },
                jobs: {}
            };

            const context = createWorkflowContext();
            
            // Simulate a condition like: always() && (needs.validate-version.result == 'success' || github.ref_type != 'tag')
            const result = await evaluateJobCondition('always() && needs.validate-version.result == "success"', mockWorkflow, context);
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
