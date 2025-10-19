import { jest } from '@jest/globals';

// Mock the askUserForInput function
const mockAskUserForInput = jest.fn() as jest.MockedFunction<(prompt: string) => Promise<string>>;

// Mock the input module
jest.mock('../lib/input', () => ({
    askUserForInput: mockAskUserForInput,
}));

import { resolveGitHubExpression } from '../lib/resolve-variable';
import { createWorkflowContext } from '../lib/context';

describe('resolveGitHubExpression', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return cached value if already resolved', async () => {
        // First call should ask user and cache the value
        mockAskUserForInput.mockResolvedValueOnce('main');
        const workflow = { on: { push: {} }, jobs: {} };
        const context = createWorkflowContext();
        const result1 = await resolveGitHubExpression('github.ref_name', workflow, context);
        expect(result1).toBe('main');

        // Second call should return cached value without asking user
        const result2 = await resolveGitHubExpression('github.ref_name', workflow, context);
        expect(result2).toBe('main');
    });

    it('should handle github.event.inputs expressions', async () => {
        mockAskUserForInput.mockResolvedValueOnce('mock-input-value');
        const workflow = { on: { push: {} }, jobs: {} };
        const context = createWorkflowContext();
        const result = await resolveGitHubExpression('github.event.inputs.terraform_version', workflow, context);
        expect(result).toBe('mock-input-value');
    });

    it('should handle env expressions with workflow env vars', async () => {
        const workflow = {
            on: { push: {} },
            jobs: {},
            env: {
                TF_VAR_region: 'us-west-2'
            }
        };

        const result = await resolveGitHubExpression('env.TF_VAR_region', workflow, createWorkflowContext());
        expect(result).toBe('us-west-2');
    });

    it('should ask user for env expressions not in workflow', async () => {
        const workflow = {
            on: { push: {} },
            jobs: {},
            env: {
                OTHER_VAR: 'other-value'
            }
        };

        mockAskUserForInput.mockResolvedValueOnce('mock-env-value');
        const result = await resolveGitHubExpression('env.TF_VAR_region', workflow, createWorkflowContext());
        expect(result).toBe('mock-env-value');
    });

    it('should handle github.ref_name expressions', async () => {
        mockAskUserForInput.mockResolvedValueOnce('main');
        const workflow = { on: { push: {} }, jobs: {} };
        const result = await resolveGitHubExpression('github.ref_name', workflow, createWorkflowContext());
        expect(result).toBe('main');
    });

    it('should handle github.sha expressions', async () => {
        mockAskUserForInput.mockResolvedValueOnce('abc123');
        const workflow = { on: { push: {} }, jobs: {} };
        const result = await resolveGitHubExpression('github.sha', workflow, createWorkflowContext());
        expect(result).toBe('abc123');
    });

    it('should handle github.workspace expressions', async () => {
        mockAskUserForInput.mockResolvedValueOnce('/workspace');
        const workflow = { on: { push: {} }, jobs: {} };
        const result = await resolveGitHubExpression('github.workspace', workflow, createWorkflowContext());
        expect(result).toBe('/workspace');
    });

    it('should handle unknown expressions by asking user', async () => {
        mockAskUserForInput.mockResolvedValueOnce('mock-value');
        const workflow = { on: { push: {} }, jobs: {} };
        const result = await resolveGitHubExpression('unknown.expression', workflow, createWorkflowContext());
        expect(result).toBe('mock-value');
    });

    it('should handle workflow without env property', async () => {
        const workflow = { on: { push: {} }, jobs: {} };

        mockAskUserForInput.mockResolvedValueOnce('mock-env-value');
        const result = await resolveGitHubExpression('env.SOME_VAR', workflow, createWorkflowContext());
        expect(result).toBe('mock-env-value');
    });

    it('should handle null/undefined workflow', async () => {
        mockAskUserForInput.mockResolvedValueOnce('mock-env-value');
        const workflow = { on: { push: {} }, jobs: {} };
        const result = await resolveGitHubExpression('env.SOME_VAR', workflow, createWorkflowContext());
        expect(result).toBe('mock-env-value');
    });

    it('should cache different expressions separately', async () => {
        mockAskUserForInput
            .mockResolvedValueOnce('main')
            .mockResolvedValueOnce('abc123');

        const workflow = { on: { push: {} }, jobs: {} };
        const result1 = await resolveGitHubExpression('github.ref_name', workflow, createWorkflowContext());
        const result2 = await resolveGitHubExpression('github.sha', workflow, createWorkflowContext());

        expect(result1).toBe('main');
        expect(result2).toBe('abc123');
    });
});
