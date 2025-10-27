import { askUserToSelectFromMenu } from '../lib/input';
import inquirer from 'inquirer';

jest.mock('inquirer');

describe('askUserToSelectFromMenu', () => {
    it('should return the first option when user selects branch', async () => {
        const options = ['branch', 'tag'];
        const result = await askUserToSelectFromMenu('Select ref type:', options);
        expect(result).toBe('branch');
    });

    it('should call inquirer.prompt with correct parameters', async () => {
        const options = ['branch', 'tag'];
        const prompt = 'Select ref type:';
        
        await askUserToSelectFromMenu(prompt, options);
        
        expect(inquirer.prompt).toHaveBeenCalledWith([
            {
                type: 'list',
                name: 'selection',
                message: prompt,
                choices: options,
            }
        ]);
    });
});

