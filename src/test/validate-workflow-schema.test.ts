import { jest } from '@jest/globals';
import { validateWorkflowSchema } from '../lib/workflow';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

// Mock the global fetch
global.fetch = mockFetch;

// Mock process.exit
const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
    throw new Error(`process.exit(${code})`);
});

describe('validateWorkflowSchema', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockExit.mockClear();
    });

    it('should validate a valid workflow', async () => {
        const mockSchema = {
            type: 'object',
            properties: {
                name: { type: 'string' },
                on: { type: 'object' },
                jobs: { type: 'object' }
            },
            required: ['name', 'on', 'jobs']
        };

        const validWorkflow = {
            name: 'Test Workflow',
            on: { push: { branches: ['main'] } },
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: []
                }
            }
        };

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockSchema)
        } as Response);

        await validateWorkflowSchema(validWorkflow);
        // Should complete without calling process.exit
        expect(mockExit).not.toHaveBeenCalled();
    });

    it('should return errors for invalid workflow', async () => {
        const mockSchema = {
            type: 'object',
            properties: {
                name: { type: 'string' },
                on: { type: 'object' },
                jobs: { type: 'object' }
            },
            required: ['name', 'on', 'jobs']
        };

        const invalidWorkflow = {
            on: { push: {} },
            jobs: {},
            description: 'Invalid workflow'
        };

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockSchema)
        } as Response);

        await expect(validateWorkflowSchema(invalidWorkflow)).rejects.toThrow('process.exit(1)');
        expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should handle fetch errors', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        const workflow = { on: { push: {} }, jobs: {} };
        await expect(validateWorkflowSchema(workflow)).rejects.toThrow('process.exit(1)');
        expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should handle non-ok response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            statusText: 'Not Found'
        } as Response);

        const workflow = { on: { push: {} }, jobs: {} };
        await expect(validateWorkflowSchema(workflow)).rejects.toThrow('process.exit(1)');
        expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should handle JSON parsing errors', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.reject(new Error('Invalid JSON'))
        } as Response);

        const workflow = { on: { push: {} }, jobs: {} };
        await expect(validateWorkflowSchema(workflow)).rejects.toThrow('process.exit(1)');
        expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should handle complex workflow validation', async () => {
        const mockSchema = {
            type: 'object',
            properties: {
                name: { type: 'string' },
                on: { type: 'object' },
                jobs: {
                    type: 'object',
                    patternProperties: {
                        '^[a-zA-Z_][a-zA-Z0-9_-]*$': {
                            type: 'object',
                            properties: {
                                'runs-on': { type: 'string' },
                                steps: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            name: { type: 'string' },
                                            uses: { type: 'string' },
                                            with: { type: 'object' }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            required: ['name', 'on', 'jobs']
        };

        const complexWorkflow = {
            name: 'Complex Workflow',
            on: {
                push: { branches: ['main'] },
                pull_request: { branches: ['main'] }
            },
            jobs: {
                test: {
                    'runs-on': 'ubuntu-latest',
                    steps: [
                        {
                            name: 'Checkout',
                            uses: 'actions/checkout@v3'
                        },
                        {
                            name: 'Setup Terraform',
                            uses: 'hashicorp/setup-terraform@v2',
                            with: {
                                terraform_version: '1.5.0'
                            }
                        }
                    ]
                },
                deploy: {
                    'runs-on': 'ubuntu-latest',
                    needs: 'test',
                    steps: [
                        {
                            name: 'Deploy',
                            run: 'terraform apply'
                        }
                    ]
                }
            }
        };

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockSchema)
        } as Response);

        await validateWorkflowSchema(complexWorkflow);
        // Should complete without calling process.exit
        expect(mockExit).not.toHaveBeenCalled();
    });

    it('should handle validation errors with instance paths', async () => {
        const mockSchema = {
            type: 'object',
            properties: {
                name: { type: 'string' },
                jobs: {
                    type: 'object',
                    patternProperties: {
                        '^[a-zA-Z_][a-zA-Z0-9_-]*$': {
                            type: 'object',
                            properties: {
                                'runs-on': { type: 'string' }
                            },
                            required: ['runs-on']
                        }
                    }
                }
            },
            required: ['name', 'jobs']
        };

        const invalidWorkflow = {
            on: { push: {} },
            jobs: {
                'valid-job-name': {
                    'runs-on': 'ubuntu-latest',
                    steps: []
                }
            }
        };

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockSchema)
        } as Response);

        await expect(validateWorkflowSchema(invalidWorkflow)).rejects.toThrow('process.exit(1)');
        expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should handle empty workflow', async () => {
        const mockSchema = {
            type: 'object',
            properties: {
                name: { type: 'string' }
            },
            required: ['name']
        };

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockSchema)
        } as Response);

        const workflow = { on: { push: {} }, jobs: {} };
        await expect(validateWorkflowSchema(workflow)).rejects.toThrow('process.exit(1)');
        expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should handle null workflow', async () => {
        const mockSchema = {
            type: 'object',
            properties: {
                name: { type: 'string' }
            },
            required: ['name']
        };

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockSchema)
        } as Response);

        const workflow = { on: { push: {} }, jobs: {} };
        await expect(validateWorkflowSchema(workflow)).rejects.toThrow('process.exit(1)');
        expect(mockExit).toHaveBeenCalledWith(1);
    });
});
