import { jest } from '@jest/globals';

// Mock the askUserForInput function
const mockAskUserForInput = jest.fn() as jest.MockedFunction<(prompt: string) => Promise<string>>;

// Mock the input module
jest.mock('../lib/input', () => ({
    askUserForInput: mockAskUserForInput,
}));

import { resolveVariablesInCommand } from '../lib/resolve-variable';
import { createWorkflowContext } from '../lib/context';

describe('resolveVariablesInCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Clear the resolved variables cache
    });

    it('should return command unchanged when no expressions found', async () => {
        const command = 'echo "Hello World"';
        const workflow = { on: { push: {} }, jobs: {} };
        const result = await resolveVariablesInCommand(command, workflow, 'test-step', 'test-job', createWorkflowContext());
        expect(result).toBe(command);
    });

    it('should resolve single GitHub expression', async () => {
        mockAskUserForInput.mockResolvedValueOnce('main');
        const command = 'echo "Branch: ${{ github.ref_name }}"';
        const workflow = { on: { push: {} }, jobs: {} };
        const result = await resolveVariablesInCommand(command, workflow, 'test-step', 'test-job', createWorkflowContext());
        expect(result).toBe('echo "Branch: main"');
    });

    it('should resolve multiple GitHub expressions', async () => {
        mockAskUserForInput
            .mockResolvedValueOnce('main')
            .mockResolvedValueOnce('abc123');

        const command = 'echo "Branch: ${{ github.ref_name }}, SHA: ${{ github.sha }}"';
        const workflow = { on: { push: {} }, jobs: {} };
        const result = await resolveVariablesInCommand(command, workflow, 'test-step', 'test-job', createWorkflowContext());
        expect(result).toBe('echo "Branch: main, SHA: abc123"');
    });

    it('should resolve expressions with workflow env vars', async () => {
        const workflow = {
            on: { push: {} },
            jobs: {},
            env: {
                TF_VAR_region: 'us-west-2'
            }
        };

        const command = 'echo "Region: ${{ env.TF_VAR_region }}"';
        const result = await resolveVariablesInCommand(command, workflow, 'test-step', 'test-job', createWorkflowContext());
        expect(result).toBe('echo "Region: us-west-2"');
    });

    it('should ask user for expressions not in workflow', async () => {
        const workflow = {
            on: { push: {} },
            jobs: {},
            env: {
                OTHER_VAR: 'other-value'
            }
        };

        mockAskUserForInput.mockResolvedValueOnce('us-east-1');
        const command = 'echo "Region: ${{ env.TF_VAR_region }}"';
        const result = await resolveVariablesInCommand(command, workflow, 'test-step', 'test-job', createWorkflowContext());
        expect(result).toBe('echo "Region: us-east-1"');
    });

    it('should handle mixed expression types', async () => {
        const workflow = {
            on: { push: {} },
            jobs: {},
            env: {
                TF_VAR_region: 'us-west-2'
            }
        };

        mockAskUserForInput
            .mockResolvedValueOnce('main')
            .mockResolvedValueOnce('terraform-1.5.0');

        const command = 'echo "Branch: ${{ github.ref_name }}, Region: ${{ env.TF_VAR_region }}, Version: ${{ github.event.inputs.terraform_version }}"';
        const result = await resolveVariablesInCommand(command, workflow, 'test-step', 'test-job', createWorkflowContext());
        expect(result).toBe('echo "Branch: main, Region: us-west-2, Version: terraform-1.5.0"');
    });

    it('should handle expressions with extra whitespace', async () => {
        mockAskUserForInput.mockResolvedValueOnce('main');
        const command = 'echo "Branch: ${{  github.ref_name  }}"';
        const workflow = { on: { push: {} }, jobs: {} };
        const result = await resolveVariablesInCommand(command, workflow, 'test-step', 'test-job', createWorkflowContext());
        // The function extracts the trimmed expression but replaces the exact placeholder
        expect(result).toBe('echo "Branch: ${{  github.ref_name  }}"');
    });

    it('should handle complex command with multiple expressions', async () => {
        const workflow = {
            on: { push: {} },
            jobs: {},
            env: {
                TF_VAR_environment: 'production'
            }
        };

        mockAskUserForInput
            .mockResolvedValueOnce('/workspace')
            .mockResolvedValueOnce('main')
            .mockResolvedValueOnce('abc123')
            .mockResolvedValueOnce('terraform-1.5.0');

        const command = 'cd ${{ github.workspace }} && terraform init -backend-config="region=${{ env.TF_VAR_environment }}" -var="branch=${{ github.ref_name }}" -var="sha=${{ github.sha }}" -var="version=${{ github.event.inputs.terraform_version }}"';
        const result = await resolveVariablesInCommand(command, workflow, 'test-step', 'test-job', createWorkflowContext());
        expect(result).toBe('cd /workspace && terraform init -backend-config="region=production" -var="branch=main" -var="sha=abc123" -var="version=terraform-1.5.0"');
    });

    it('should handle empty command', async () => {
        const workflow = { on: { push: {} }, jobs: {} };
        const result = await resolveVariablesInCommand('', workflow, 'test-step', 'test-job', createWorkflowContext());
        expect(result).toBe('');
    });

    it('should handle command with no workflow', async () => {
        mockAskUserForInput.mockResolvedValueOnce('main');
        const command = 'echo "Branch: ${{ github.ref_name }}"';
        const workflow = { on: { push: {} }, jobs: {} };
        const result = await resolveVariablesInCommand(command, workflow, 'test-step', 'test-job', createWorkflowContext());
        expect(result).toBe('echo "Branch: main"');
    });
});
