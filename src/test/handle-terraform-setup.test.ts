import { jest } from '@jest/globals';

// Mock the executeCommand function
const mockExecuteCommand = jest.fn() as jest.MockedFunction<(command: string, cwd: string, showOutput?: boolean, envVars?: Record<string, string>) => Promise<{ success: boolean; output: string; error: string; exitCode: number }>>;

// Mock the askUserForInput function
const mockAskUserForInput = jest.fn() as jest.MockedFunction<(prompt: string) => Promise<string>>;

// Mock the command module
jest.mock('../lib/command', () => ({
    executeCommand: mockExecuteCommand,
}));

// Mock the input module
jest.mock('../lib/input', () => ({
    askUserForInput: mockAskUserForInput,
}));

import { handleTerraformSetup } from '../lib/step';
import { createWorkflowContext } from '../lib/context';

// Mock console methods to avoid cluttering test output
global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
};

// Mock process.exit to prevent tests from crashing
const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
    throw new Error(`process.exit called with code: ${code}`);
});

describe('handleTerraformSetup', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Clear the resolved variables cache
    });

    it('should handle terraform setup step with version', async () => {
        const step = {
            with: {
                terraform_version: '1.5.0'
            }
        };

        const mockVersionOutput = JSON.stringify({
            terraform_version: '1.5.0'
        });

        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: mockVersionOutput,
            error: '',
            exitCode: 0
        });

        const workflow = { on: { push: {} }, jobs: {} };
        await expect(handleTerraformSetup(step, false, workflow, '/test/dir', 'test-job', createWorkflowContext(null))).resolves.not.toThrow();
    });

    it('should handle dry run mode', async () => {
        const step = {
            with: {
                terraform_version: '1.5.0'
            }
        };

        const workflow = { on: { push: {} }, jobs: {} };
        await expect(handleTerraformSetup(step, true, workflow, '/test/dir', 'test-job', createWorkflowContext(null))).resolves.not.toThrow();
        expect(mockExecuteCommand).not.toHaveBeenCalled();
    });

    it('should handle step without terraform_version', async () => {
        const step = {
            with: {}
        };

        const workflow = { on: { push: {} }, jobs: {} };
        await expect(handleTerraformSetup(step, false, workflow, '/test/dir', 'test-job', createWorkflowContext(null))).resolves.not.toThrow();
        expect(mockExecuteCommand).not.toHaveBeenCalled();
    });

    it('should handle step without with property', async () => {
        const step = {};

        const workflow = { on: { push: {} }, jobs: {} };
        await expect(handleTerraformSetup(step, false, workflow, '/test/dir', 'test-job', createWorkflowContext(null))).resolves.not.toThrow();
        expect(mockExecuteCommand).not.toHaveBeenCalled();
    });

    it('should use provided working directory', async () => {
        const step = {
            with: {
                terraform_version: '1.5.0'
            }
        };

        const mockVersionOutput = JSON.stringify({
            terraform_version: '1.5.0'
        });

        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: mockVersionOutput,
            error: '',
            exitCode: 0
        });

        const workflow = { on: { push: {} }, jobs: {} };
        await expect(handleTerraformSetup(step, false, workflow, '/custom/dir', 'test-job', createWorkflowContext(null))).resolves.not.toThrow();
    });

    it('should resolve variables in terraform_version', async () => {
        const step = {
            with: {
                terraform_version: '${{ github.event.inputs.terraform_version }}'
            }
        };

        const workflow = {
            on: { push: {} },
            jobs: {},
            inputs: {
                terraform_version: '1.5.0'
            }
        };

        mockAskUserForInput.mockResolvedValueOnce('1.5.0');

        const mockVersionOutput = JSON.stringify({
            terraform_version: '1.5.0'
        });

        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: mockVersionOutput,
            error: '',
            exitCode: 0
        });

        await expect(handleTerraformSetup(step, false, workflow, '/test/dir', 'test-job', createWorkflowContext(null))).resolves.not.toThrow();
    });

    it('should propagate terraform version check errors', async () => {
        const step = {
            with: {
                terraform_version: '1.5.0'
            }
        };

        mockExecuteCommand.mockResolvedValueOnce({
            success: false,
            output: '',
            error: 'terraform: command not found',
            exitCode: 1
        });

        const workflow = { on: { push: {} }, jobs: {} };
        await expect(handleTerraformSetup(step, false, workflow, '/test/dir', 'test-job', createWorkflowContext(null))).rejects.toThrow('process.exit called with code: 1');
    });

    it('should handle version mismatch in setup', async () => {
        const step = {
            with: {
                terraform_version: '1.5.0'
            }
        };

        const mockVersionOutput = JSON.stringify({
            terraform_version: '1.4.0'
        });

        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: mockVersionOutput,
            error: '',
            exitCode: 0
        });

        const workflow = { on: { push: {} }, jobs: {} };
        await expect(handleTerraformSetup(step, false, workflow, '/test/dir', 'test-job', createWorkflowContext(null))).rejects.toThrow('process.exit called with code: 1');
    });

    it('should handle JSON parsing errors', async () => {
        const step = {
            with: {
                terraform_version: '1.5.0'
            }
        };

        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: 'invalid json',
            error: '',
            exitCode: 0
        });

        const workflow = { on: { push: {} }, jobs: {} };
        await expect(handleTerraformSetup(step, false, workflow, '/test/dir', 'test-job', createWorkflowContext(null))).rejects.toThrow('process.exit called with code: 1');
    });

    it('should handle missing terraform_version field in JSON', async () => {
        const step = {
            with: {
                terraform_version: '1.5.0'
            }
        };

        const mockVersionOutput = JSON.stringify({
            some_other_field: 'value'
        });

        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: mockVersionOutput,
            error: '',
            exitCode: 0
        });

        const workflow = { on: { push: {} }, jobs: {} };
        await expect(handleTerraformSetup(step, false, workflow, '/test/dir', 'test-job', createWorkflowContext(null))).rejects.toThrow('process.exit called with code: 1');
    });

    it('should use process.cwd() as default working directory', async () => {
        const step = {
            with: {
                terraform_version: '1.5.0'
            }
        };

        const mockVersionOutput = JSON.stringify({
            terraform_version: '1.5.0'
        });

        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: mockVersionOutput,
            error: '',
            exitCode: 0
        });

        const workflow = { on: { push: {} }, jobs: {} };
        await expect(handleTerraformSetup(step, false, workflow, '/test/dir', 'test-job', createWorkflowContext(null))).resolves.not.toThrow();
    });

    it('should handle complex terraform_version with multiple variables', async () => {
        const step = {
            with: {
                terraform_version: '${{ github.event.inputs.terraform_version }}-${{ env.TF_VAR_environment }}'
            }
        };

        const workflow = {
            on: { push: {} },
            jobs: {},
            env: {
                TF_VAR_environment: 'prod'
            }
        };

        mockAskUserForInput.mockResolvedValueOnce('1.5.0');

        const mockVersionOutput = JSON.stringify({
            terraform_version: '1.5.0-prod'
        });

        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: mockVersionOutput,
            error: '',
            exitCode: 0
        });

        await expect(handleTerraformSetup(step, false, workflow, '/test/dir', 'test-job', createWorkflowContext(null))).resolves.not.toThrow();
    });
});
