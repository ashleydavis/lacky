import { validateWorkflowSchema } from '../lib/workflow';
import { Workflow } from '../types/workflow';

// Mock fetch
global.fetch = jest.fn();

// Mock process.exit
const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
    throw new Error(`process.exit(${code})`);
});

describe('Workflow Functions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockExit.mockClear();
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

            await validateWorkflowSchema(mockWorkflow);
            // Should complete without calling process.exit
            expect(mockExit).not.toHaveBeenCalled();
        });

        it('should handle fetch errors', async () => {
            (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

            const mockWorkflow: Workflow = {
                name: 'Test Workflow',
                on: { push: {} },
                jobs: {}
            };

            await expect(validateWorkflowSchema(mockWorkflow)).rejects.toThrow('process.exit(1)');
            expect(mockExit).toHaveBeenCalledWith(1);
        });
    });
});
