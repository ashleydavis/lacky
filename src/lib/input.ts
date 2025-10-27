import * as readline from 'readline';
import ora from 'ora';
import inquirer from 'inquirer';

export async function askUserForInput(prompt: string, placeholder?: string): Promise<string> {
    // Add blank line before prompt for better readability
    console.log();
    
    const answer = await inquirer.prompt([
        {
            type: 'input',
            name: 'value',
            message: prompt,
            default: placeholder,
        }
    ]);
    
    return answer.value.trim();
}

export function askUserConfirmation(question: string): Promise<'yes' | 'no' | 'all' | 'quit' | 'skip'> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(`${question} (y/n/a/q/s): `, (answer: string) => {
            rl.close();
            const lowerAnswer = answer.toLowerCase();
            if (lowerAnswer === 'y' || lowerAnswer === 'yes') {
                resolve('yes');
            } 
            else if (lowerAnswer === 'a' || lowerAnswer === 'all') {
                resolve('all');
            } 
            else if (lowerAnswer === 'q' || lowerAnswer === 'quit') {
                resolve('quit');
            } 
            else if (lowerAnswer === 's' || lowerAnswer === 'skip') {
                resolve('skip');
            } 
            else {
                resolve('no');
            }
        });
    });
}

export function createSpinner() {
    return ora({
        text: 'Running...',
        color: 'cyan',
        spinner: 'dots',
        indent: 6
    });
}

export async function askUserToSelectFromMenu(prompt: string, options: string[]): Promise<string> {
    // Add blank line before prompt for better readability
    console.log();
    
    const answer = await inquirer.prompt([
        {
            type: 'list',
            name: 'selection',
            message: prompt,
            choices: options,
        }
    ]);
    
    return answer.selection;
}
