import { jest } from '@jest/globals';

// Mock the executeCommand function
const mockExecuteCommand = jest.fn() as jest.MockedFunction<(command: string, cwd: string, showOutput?: boolean, envVars?: Record<string, string>) => Promise<{ success: boolean; output: string; error: string; exitCode: number }>>;

// Mock the askUserForInput function
const mockAskUserForInput = jest.fn() as jest.MockedFunction<(prompt: string) => Promise<string>>;

// Mock the askUserConfirmation function
const mockAskUserConfirmation = jest.fn() as jest.MockedFunction<(question: string) => Promise<'yes' | 'no' | 'all' | 'quit' | 'skip'>>;

// Mock the command module
jest.mock('../lib/command', () => ({
    executeCommand: mockExecuteCommand,
}));

// Mock the askUserForSecret function
const mockAskUserForSecret = jest.fn() as jest.MockedFunction<(prompt: string) => Promise<string>>;

// Mock the input module
jest.mock('../lib/input', () => ({
    askUserForInput: mockAskUserForInput,
    askUserForSecret: mockAskUserForSecret,
    askUserConfirmation: mockAskUserConfirmation,
    createSpinner: jest.fn(() => ({
        start: jest.fn(),
        succeed: jest.fn(),
        fail: jest.fn(),
        stop: jest.fn(),
    })),
}));

import { runWorkflow } from '../lib/workflow';
import { createWorkflowContext } from '../lib/context';

// Mock console methods to avoid cluttering test output
global.console = {
    ...console,
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
};

describe('runWorkflow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockExecuteCommand.mockReset();
        mockAskUserConfirmation.mockReset();
        mockAskUserForInput.mockReset();
        mockAskUserForSecret.mockReset();
        // Default mock return values - 'yes' to run jobs by default
        mockAskUserConfirmation.mockResolvedValue('yes');
        // Clear the resolved variables cache
    });

    it('should handle workflow with no jobs', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {}
        };

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
    });

    it('should handle workflow with no jobs property', async () => {
        const workflow = {
            on: { push: {} },
            jobs: {}
        };

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
    });

    it('should run single job with single step in dry run mode', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: [
                        {
                            name: 'Test Step',
                            run: 'echo "Hello World"'
                        }
                    ]
                }
            }
        };

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, true, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
        expect(mockExecuteCommand).not.toHaveBeenCalled();
    });

    it('should run single job with single step in normal mode', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: [
                        {
                            name: 'Test Step',
                            run: 'echo "Hello World"'
                        }
                    ]
                }
            }
        };

        mockAskUserConfirmation.mockResolvedValueOnce('yes');
        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: 'Hello World',
            error: '',
            exitCode: 0
        });

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
        expect(mockExecuteCommand).toHaveBeenCalledWith('echo "Hello World"', expect.any(String), true, expect.any(Object), null);
    });

    it('should handle multiple jobs', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: [
                        {
                            name: 'Test Step',
                            run: 'echo "Test"'
                        }
                    ]
                },
                build: {
                    'runs-on': 'ubuntu-latest',
                    steps: [
                        {
                            name: 'Build Step',
                            run: 'echo "Build"'
                        }
                    ]
                }
            }
        };

        mockAskUserConfirmation
            .mockResolvedValueOnce('yes')
            .mockResolvedValueOnce('yes');
        mockExecuteCommand
            .mockResolvedValueOnce({
                success: true,
                output: 'Test',
                error: '',
                exitCode: 0
            })
            .mockResolvedValueOnce({
                success: true,
                output: 'Build',
                error: '',
                exitCode: 0
            });

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
        expect(mockExecuteCommand).toHaveBeenCalledTimes(2);
    });

    it('should handle job with no steps', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: []
                }
            }
        };

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
    });

    it('should handle step without name', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: [
                        {
                            run: 'echo "Hello World"'
                        }
                    ]
                }
            }
        };

        mockAskUserConfirmation.mockResolvedValueOnce('yes');
        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: 'Hello World',
            error: '',
            exitCode: 0
        });

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
    });

    it('should handle step without run or uses', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: [
                        {
                            name: 'Unknown Step'
                        }
                    ]
                }
            }
        };

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
    });

    it('should handle working directory resolution', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: [
                        {
                            name: 'Test Step',
                            run: 'echo "Hello World"',
                            'working-directory': 'subdir'
                        }
                    ]
                }
            }
        };

        mockAskUserConfirmation.mockResolvedValueOnce('yes');
        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: 'Hello World',
            error: '',
            exitCode: 0
        });

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/root', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
        expect(mockExecuteCommand).toHaveBeenCalledWith('echo "Hello World"', expect.stringContaining('subdir'), true, expect.any(Object), null);
    });

    it('should handle job-level working directory defaults', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    defaults: {
                        run: {
                            'working-directory': 'job-dir'
                        }
                    },
                    steps: [
                        {
                            name: 'Test Step',
                            run: 'echo "Hello World"'
                        }
                    ]
                }
            }
        };

        mockAskUserConfirmation.mockResolvedValueOnce('yes');
        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: 'Hello World',
            error: '',
            exitCode: 0
        });

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/root', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
        expect(mockExecuteCommand).toHaveBeenCalledWith('echo "Hello World"', expect.stringContaining('job-dir'), true, expect.any(Object), null);
    });

    it('should handle workflow-level working directory defaults', async () => {
        const workflow = {
            name: 'Test Workflow',
            defaults: {
                run: {
                    'working-directory': 'workflow-dir'
                }
            },
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: [
                        {
                            name: 'Test Step',
                            run: 'echo "Hello World"'
                        }
                    ]
                }
            }
        };

        mockAskUserConfirmation.mockResolvedValueOnce('yes');
        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: 'Hello World',
            error: '',
            exitCode: 0
        });

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/root', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
        expect(mockExecuteCommand).toHaveBeenCalledWith('echo "Hello World"', expect.stringContaining('workflow-dir'), true, expect.any(Object), null);
    });

    it('should handle user confirmation responses', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: [
                        {
                            name: 'Test Step',
                            run: 'echo "Hello World"'
                        }
                    ]
                }
            }
        };

        // Test 'no' response
        mockAskUserConfirmation.mockResolvedValueOnce('no');
        const workflowWithOn1 = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn1, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
        expect(mockExecuteCommand).not.toHaveBeenCalled();

        // Test 'skip' response
        mockAskUserConfirmation.mockResolvedValueOnce('skip');
        const workflowWithOn2 = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn2, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
        expect(mockExecuteCommand).not.toHaveBeenCalled();

        // Test 'quit' response - should throw error
        mockAskUserConfirmation.mockResolvedValueOnce('quit');
        const workflowWithOn3 = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn3, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).rejects.toThrow('Workflow execution stopped by user');
        expect(mockExecuteCommand).not.toHaveBeenCalled();
    });

    it('should handle run all mode', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: [
                        {
                            name: 'First Step',
                            run: 'echo "First"'
                        },
                        {
                            name: 'Second Step',
                            run: 'echo "Second"'
                        }
                    ]
                }
            }
        };

        mockAskUserConfirmation.mockResolvedValueOnce('all');
        mockExecuteCommand
            .mockResolvedValueOnce({
                success: true,
                output: 'First',
                error: '',
                exitCode: 0
            })
            .mockResolvedValueOnce({
                success: true,
                output: 'Second',
                error: '',
                exitCode: 0
            });

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
        expect(mockExecuteCommand).toHaveBeenCalledTimes(2);
    });

    it('should handle command failure and ask for continuation', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: [
                        {
                            name: 'Failing Step',
                            run: 'exit 1'
                        }
                    ]
                }
            }
        };

        mockAskUserConfirmation
            .mockResolvedValueOnce('yes') // Initial confirmation
            .mockResolvedValueOnce('yes'); // Continue after failure
        mockExecuteCommand.mockResolvedValueOnce({
            success: false,
            output: 'Error output',
            error: 'Error message',
            exitCode: 1
        });

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
    });

    it('should handle command failure and quit', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: [
                        {
                            name: 'Failing Step',
                            run: 'exit 1'
                        }
                    ]
                }
            }
        };

        mockAskUserConfirmation
            .mockResolvedValueOnce('yes') // Initial confirmation
            .mockResolvedValueOnce('quit'); // Quit after failure
        mockExecuteCommand.mockResolvedValueOnce({
            success: false,
            output: 'Error output',
            error: 'Error message',
            exitCode: 1
        });

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
    });

    it('should handle command failure and stop', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: [
                        {
                            name: 'Failing Step',
                            run: 'exit 1'
                        }
                    ]
                }
            }
        };

        mockAskUserConfirmation
            .mockResolvedValueOnce('yes') // Initial confirmation
            .mockResolvedValueOnce('no'); // Stop after failure
        mockExecuteCommand.mockResolvedValueOnce({
            success: false,
            output: 'Error output',
            error: 'Error message',
            exitCode: 1
        });

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
    });

    it('should handle terraform setup step', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: [
                        {
                            name: 'Setup Terraform',
                            uses: 'hashicorp/setup-terraform@v2',
                            with: {
                                terraform_version: '1.5.0'
                            }
                        }
                    ]
                }
            }
        };

        // Mock the terraform setup by mocking executeCommand for version check
        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: JSON.stringify({ terraform_version: '1.5.0' }),
            error: '',
            exitCode: 0
        });

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
    });

    it('should handle uses step in dry run mode', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: [
                        {
                            name: 'Checkout',
                            uses: 'actions/checkout@v3'
                        }
                    ]
                }
            }
        };

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, true, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
    });

    it('should handle uses step in normal mode', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: [
                        {
                            name: 'Checkout',
                            uses: 'actions/checkout@v3'
                        }
                    ]
                }
            }
        };

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
    });

    it('should resolve variables in commands', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: [
                        {
                            name: 'Test Step',
                            run: 'echo "Branch: ${{ github.ref_name }}"'
                        }
                    ]
                }
            }
        };

        mockAskUserForInput.mockResolvedValueOnce('main');
        mockAskUserConfirmation.mockResolvedValueOnce('yes');
        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: 'Branch: main',
            error: '',
            exitCode: 0
        });

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
        expect(mockExecuteCommand).toHaveBeenCalledWith('echo "Branch: main"', expect.any(String), true, expect.any(Object), null);
    });

    it('should handle command execution errors', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: [
                        {
                            name: 'Test Step',
                            run: 'echo "Hello World"'
                        }
                    ]
                }
            }
        };

        mockAskUserConfirmation
            .mockResolvedValueOnce('yes') // Job confirmation
            .mockResolvedValueOnce('yes'); // Command confirmation
        mockExecuteCommand.mockRejectedValueOnce(new Error('Command execution failed'));

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).rejects.toThrow('Command execution failed');
    });

    it('should handle step-level environment variables', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: [
                        {
                            name: 'Test Step',
                            run: 'echo $TF_VAR_region',
                            env: {
                                TF_VAR_region: 'us-west-2',
                                TF_WORKSPACE: 'production'
                            }
                        }
                    ]
                }
            }
        };

        mockAskUserConfirmation.mockResolvedValueOnce('yes');
        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: 'us-west-2',
            error: '',
            exitCode: 0
        });

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
        
        // Verify that step env vars were passed to executeCommand
        expect(mockExecuteCommand).toHaveBeenCalledWith(
            'echo $TF_VAR_region',
            expect.any(String),
            true,
            expect.objectContaining({
                TF_VAR_region: 'us-west-2',
                TF_WORKSPACE: 'production'
            }),
            null
        );
    });

    it('should resolve GitHub expressions in step-level env variables', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: [
                        {
                            name: 'Test Step',
                            run: 'echo $BRANCH',
                            env: {
                                BRANCH: '${{ github.ref_name }}'
                            }
                        }
                    ]
                }
            }
        };

        mockAskUserForInput.mockResolvedValueOnce('main');
        mockAskUserConfirmation.mockResolvedValueOnce('yes');
        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: 'main',
            error: '',
            exitCode: 0
        });

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
        
        expect(mockExecuteCommand).toHaveBeenCalledWith(
            'echo $BRANCH',
            expect.any(String),
            true,
            expect.objectContaining({
                BRANCH: 'main'
            }),
            null
        );
    });

    it('should handle matrix include strategy', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    strategy: {
                        matrix: {
                            include: [
                                {
                                    directory: 'terraform',
                                    region: 'us-west-2'
                                }
                            ]
                        }
                    },
                    defaults: {
                        run: {
                            'working-directory': 'terraform/${{ matrix.directory }}'
                        }
                    },
                    steps: [
                        {
                            name: 'Test Step',
                            run: 'echo ${{ matrix.region }}'
                        }
                    ]
                }
            }
        };

        mockAskUserConfirmation.mockResolvedValueOnce('yes');
        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: 'us-west-2',
            error: '',
            exitCode: 0
        });

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
        
        // Verify that the working directory was resolved with matrix variable
        expect(mockExecuteCommand).toHaveBeenCalledWith(
            'echo us-west-2',
            expect.stringContaining('terraform/terraform'),
            true,
            expect.any(Object),
            null
        );
    });

    it('should resolve working-directory with matrix variables', async () => {
        const workflow = {
            name: 'Test Workflow',
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    strategy: {
                        matrix: {
                            include: [
                                {
                                    directory: 'app',
                                    env: 'production'
                                }
                            ]
                        }
                    },
                    defaults: {
                        run: {
                            'working-directory': 'apps/${{ matrix.directory }}'
                        }
                    },
                    steps: [
                        {
                            name: 'Test Step',
                            run: 'pwd'
                        }
                    ]
                }
            }
        };

        mockAskUserConfirmation.mockResolvedValueOnce('yes');
        mockExecuteCommand.mockResolvedValueOnce({
            success: true,
            output: '/test/dir/apps/app',
            error: '',
            exitCode: 0
        });

        const workflowWithOn = { ...workflow, on: { push: {} } };
        await expect(runWorkflow(workflowWithOn, false, '/test/dir', '/test/workflow.yml', createWorkflowContext(null), false, 10)).resolves.not.toThrow();
        
        expect(mockExecuteCommand).toHaveBeenCalledWith(
            'pwd',
            expect.stringContaining('apps/app'),
            true,
            expect.any(Object),
            null
        );
    });
});
