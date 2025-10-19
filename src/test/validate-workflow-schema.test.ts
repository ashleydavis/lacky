import { jest } from '@jest/globals';
import { validateWorkflowSchema } from '../lib/workflow';

// Mock fetch globally
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;

// Mock the global fetch
global.fetch = mockFetch;

describe('validateWorkflowSchema', () => {
    beforeEach(() => {
        jest.clearAllMocks();
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

        const result = await validateWorkflowSchema(validWorkflow);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
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

        const result = await validateWorkflowSchema(invalidWorkflow);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain('required');
    });

    it('should handle fetch errors', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'));

        const workflow = { on: { push: {} }, jobs: {} };
        const result = await validateWorkflowSchema(workflow);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(['Schema validation failed: Network error']);
    });

    it('should handle non-ok response', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            statusText: 'Not Found'
        } as Response);

        const workflow = { on: { push: {} }, jobs: {} };
        const result = await validateWorkflowSchema(workflow);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(['Schema validation failed: Failed to fetch schema: Not Found']);
    });

    it('should handle JSON parsing errors', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.reject(new Error('Invalid JSON'))
        } as Response);

        const workflow = { on: { push: {} }, jobs: {} };
        const result = await validateWorkflowSchema(workflow);

        expect(result.valid).toBe(false);
        expect(result.errors).toEqual(['Schema validation failed: Invalid JSON']);
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

        const result = await validateWorkflowSchema(complexWorkflow);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
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

        const result = await validateWorkflowSchema(invalidWorkflow);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
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
        const result = await validateWorkflowSchema(workflow);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
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
        const result = await validateWorkflowSchema(workflow);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
    });
});
