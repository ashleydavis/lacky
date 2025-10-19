import * as readline from 'readline';
import ora from 'ora';

export async function askUserForInput(prompt: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
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
