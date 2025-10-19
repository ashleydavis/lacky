import { validateWorkflowSchema } from '../lib/workflow';
import { Workflow } from '../types/workflow';

// Mock fetch
global.fetch = jest.fn();

describe('Workflow Functions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('validateWorkflowSchema', () => {
        it('should validate a valid workflow', async () => {
            const mockSchema = {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    on: { type: 'object' },
                    jobs: { type: 'object' }
                }
            };

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(mockSchema)
            });

            const mockWorkflow: Workflow = {
                name: 'Test Workflow',
                on: { push: {} },
                jobs: {}
            };

            const result = await validateWorkflowSchema(mockWorkflow);
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
        });

        it('should handle fetch errors', async () => {
            (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

            const mockWorkflow: Workflow = {
                name: 'Test Workflow',
                on: { push: {} },
                jobs: {}
            };

            const result = await validateWorkflowSchema(mockWorkflow);
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Schema validation failed: Network error');
        });
    });
});
