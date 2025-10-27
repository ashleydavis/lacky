import { checkTerraformVersion, handleTerraformSetup, handleAction } from '../lib/step';
import { executeCommand } from '../lib/command';
import { Workflow, Step } from '../types/workflow';
import { resolveVariablesInCommand } from '../lib/resolve-variable';
import { createWorkflowContext } from '../lib/context';

// Mock the command module
jest.mock('../lib/command');
const mockExecuteCommand = executeCommand as jest.MockedFunction<typeof executeCommand>;

// Mock the resolve-variable module
const mockResolveVariablesInCommand = resolveVariablesInCommand as jest.MockedFunction<typeof resolveVariablesInCommand>;

// Mock the index module for stepOutputs
jest.mock('../index', () => ({
    stepOutputs: new Map()
}));

// Mock the resolve-variable module
jest.mock('../lib/resolve-variable', () => ({
    resolveVariablesInCommand: jest.fn()
}));


describe('Step Functions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('checkTerraformVersion', () => {
        it('should succeed when versions match', async () => {
            const mockVersionInfo = { terraform_version: '1.5.0' };
            mockExecuteCommand.mockResolvedValue({
                success: true,
                output: JSON.stringify(mockVersionInfo),
                error: '',
                exitCode: 0
            });

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const processSpy = jest.spyOn(process, 'exit').mockImplementation();

            await checkTerraformVersion('1.5.0', '/test/dir', null);

            expect(mockExecuteCommand).toHaveBeenCalledWith(
                'terraform version -json',
                '/test/dir',
                false,
                expect.any(Object),
                null
            );
            expect(consoleSpy).toHaveBeenCalledWith('      Local Terraform version: 1.5.0');
            expect(consoleSpy).toHaveBeenCalledWith('      \x1b[32m✓\x1b[0m Terraform version matches (1.5.0)');

            consoleSpy.mockRestore();
            processSpy.mockRestore();
        });

        it('should fail when versions do not match', async () => {
            const mockVersionInfo = { terraform_version: '1.4.0' };
            mockExecuteCommand.mockResolvedValue({
                success: true,
                output: JSON.stringify(mockVersionInfo),
                error: '',
                exitCode: 0
            });

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await expect(checkTerraformVersion('1.5.0', '/test/dir', null))
                .rejects
                .toThrow('Terraform version mismatch! Required: 1.5.0, Local: 1.4.0');

            expect(consoleSpy).toHaveBeenCalledWith('      ✖ Terraform version mismatch!');

            consoleSpy.mockRestore();
        });
    });

    describe('handleTerraformSetup', () => {
        it('should handle terraform setup with version', async () => {
            const mockStep: Step = {
                uses: 'hashicorp/setup-terraform@v2',
                with: { terraform_version: '1.5.0' }
            };

            const mockWorkflow: Workflow = {
                name: 'Test Workflow',
                on: { push: {} },
                jobs: {}
            };

            mockResolveVariablesInCommand.mockResolvedValue('1.5.0');

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            try {
                await handleTerraformSetup(mockStep, false, mockWorkflow, '/test/dir', 'test-job', createWorkflowContext(null));
            } catch (error) {
                // Expected to throw due to process.exit
            }

            expect(consoleSpy).toHaveBeenCalledWith('      Setting up Terraform...');
            expect(mockResolveVariablesInCommand).toHaveBeenCalledWith('1.5.0', mockWorkflow, 'terraform-setup', 'test-job', expect.any(Object));

            consoleSpy.mockRestore();
        });
    });

    describe('handleAction', () => {
        it('should handle action with mock', async () => {
            const mockStep: Step = {
                uses: 'tj-actions/changed-files@v41',
                with: { files: 'test/**' }
            };

            const mockWorkflow: Workflow = {
                name: 'Test Workflow',
                on: { push: {} },
                jobs: {}
            };

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await handleAction(mockStep, false, mockWorkflow, '/test/dir', 'test-step', '/test/workflow.yml', 'test-job', createWorkflowContext());

            expect(consoleSpy).toHaveBeenCalledWith('      Running action: tj-actions/changed-files@v41...');

            consoleSpy.mockRestore();
        });
    });
});
