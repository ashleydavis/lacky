import * as readline from 'readline';
import ora from 'ora';
import inquirer from 'inquirer';
import pc from 'picocolors';

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
    
    // Clear the prompt line (just the input line, not the blank line before it)
    process.stdout.write('\x1b[1A\x1b[2K'); // Move up and clear line
    
    return answer.value.trim();
}

export function askUserConfirmation(question: string): Promise<'yes' | 'no' | 'all' | 'quit' | 'skip'> {
    return new Promise((resolve) => {
        // Use ANSI 256-color code for orange (208) with bold
        const orange = '\x1b[38;5;208m';
        const bold = '\x1b[1m';
        const reset = '\x1b[0m';
        process.stdout.write(`${bold}${orange}${question} [(y)es / (n)o / (a)ll / (q)uit]: ${reset}`);
        
        // Set raw mode to read single keypresses
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(true);
        }
        process.stdin.resume();
        process.stdin.setEncoding('utf8');
        
        const cleanup = () => {
            process.stdin.removeListener('data', onData);
            process.removeListener('SIGINT', onSigInt);
            if (process.stdin.isTTY) {
                process.stdin.setRawMode(false);
            }
            process.stdin.pause();
        };
        
        const onSigInt = () => {
            cleanup();
            process.stdout.write('\n');
            process.exit(130); // Standard exit code for SIGINT
        };
        
        const onData = (key: string) => {
            // In raw mode, Ctrl-C sends character code 3
            if (key === '\u0003') {
                onSigInt();
                return;
            }
            
            const lowerKey = key.toLowerCase();
            
            // Only accept valid keys
            if (lowerKey !== 'y' && lowerKey !== 'n' && lowerKey !== 'a' && lowerKey !== 'q') {
                // Invalid key, ignore it and wait for another
                return;
            }
            
            cleanup();
            
            // Echo the key and add newline
            process.stdout.write(key + '\n');
            
            // Erase the prompt line (move up one line and clear it)
            process.stdout.write('\x1b[1A\x1b[2K');
            
            if (lowerKey === 'y') {
                resolve('yes');
            } 
            else if (lowerKey === 'a') {
                resolve('all');
            } 
            else if (lowerKey === 'q') {
                resolve('quit');
            } 
            else if (lowerKey === 'n') {
                resolve('no');
            }
        };
        
        process.once('SIGINT', onSigInt);
        process.stdin.on('data', onData);
    });
}

export function createSpinner() {
    return ora({
        text: 'Running...',
        color: 'cyan',
        spinner: 'dots'
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
    
    // Clear the menu prompt (just prompt + options, not the blank line before it)
    const linesToClear = 1 + options.length; // prompt + all options
    for (let i = 0; i < linesToClear; i++) {
        process.stdout.write('\x1b[1A\x1b[2K'); // Move up and clear each line
    }
    
    return answer.selection;
}
