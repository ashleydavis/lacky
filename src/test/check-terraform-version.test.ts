import { jest } from '@jest/globals';

// Mock the executeCommand function
const mockExecuteCommand = jest.fn() as jest.MockedFunction<(command: string, cwd: string, showOutput?: boolean, envVars?: Record<string, string>) => Promise<{ success: boolean; output: string; error: string; exitCode: number }>>;

// Mock the command module
jest.mock('../lib/command', () => ({
    executeCommand: mockExecuteCommand,
}));

import { checkTerraformVersion } from '../lib/step';

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

describe('checkTerraformVersion', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should pass when versions match exactly', async () => {
        const mockVersionOutput = JSON.stringify({
            terraform_version: '1.5.0'
        });

        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: mockVersionOutput,
            error: '',
            exitCode: 0
        });

        await expect(checkTerraformVersion('1.5.0', '/test/dir', null)).resolves.not.toThrow();
    });

    it('should pass when versions match with different suffixes', async () => {
        const mockVersionOutput = JSON.stringify({
            terraform_version: '1.5.0+ent'
        });

        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: mockVersionOutput,
            error: '',
            exitCode: 0
        });

        await expect(checkTerraformVersion('1.5.0', '/test/dir', null)).resolves.not.toThrow();
    });

    it('should throw error when versions do not match', async () => {
        const mockVersionOutput = JSON.stringify({
            terraform_version: '1.4.0'
        });

        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: mockVersionOutput,
            error: '',
            exitCode: 0
        });

        await expect(checkTerraformVersion('1.5.0', '/test/dir', null)).rejects.toThrow('Terraform version mismatch! Required: 1.5.0, Local: 1.4.0');
    });

    it('should throw error when terraform command fails', async () => {
        mockExecuteCommand.mockResolvedValueOnce({
            success: false,
            output: '',
            error: 'terraform: command not found',
            exitCode: 1
        });

        await expect(checkTerraformVersion('1.5.0', '/test/dir', null)).rejects.toThrow('Failed to get local Terraform version: terraform: command not found');
    });

    it('should throw error when JSON parsing fails', async () => {
        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: 'invalid json',
            error: '',
            exitCode: 0
        });

        await expect(checkTerraformVersion('1.5.0', '/test/dir', null)).rejects.toThrow();
    });

    it('should throw error when terraform_version field is missing', async () => {
        const mockVersionOutput = JSON.stringify({
            some_other_field: 'value'
        });

        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: mockVersionOutput,
            error: '',
            exitCode: 0
        });

        await expect(checkTerraformVersion('1.5.0', '/test/dir', null)).rejects.toThrow();
    });

    it('should normalize versions correctly', async () => {
        const testCases = [
            { local: '1.5.0', required: '1.5.0', shouldMatch: true },
            { local: '1.5.0+ent', required: '1.5.0', shouldMatch: true },
            { local: '1.5.0-dev', required: '1.5.0', shouldMatch: true },
            { local: '1.5.0', required: '1.5.0+ent', shouldMatch: true },
            { local: '1.4.0', required: '1.5.0', shouldMatch: false },
            { local: '1.5.1', required: '1.5.0', shouldMatch: false },
        ];

        for (const testCase of testCases) {
            const mockVersionOutput = JSON.stringify({
                terraform_version: testCase.local
            });

            mockExecuteCommand.mockResolvedValueOnce({
                success: true,
                output: mockVersionOutput,
                error: '',
                exitCode: 0
            });

            if (testCase.shouldMatch) {
                await expect(checkTerraformVersion(testCase.required, '/test/dir')).resolves.not.toThrow();
            } else {
                await expect(checkTerraformVersion(testCase.required, '/test/dir')).rejects.toThrow();
            }
        }
    });

    it('should call executeCommand with correct parameters', async () => {
        const mockVersionOutput = JSON.stringify({
            terraform_version: '1.5.0'
        });

        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: mockVersionOutput,
            error: '',
            exitCode: 0
        });

        await checkTerraformVersion('1.5.0', '/test/dir', null);

        expect(mockExecuteCommand).toHaveBeenCalledWith('terraform version -json', '/test/dir', false, expect.any(Object), null);
    });
});
