import { spawn } from 'child_process';

export function executeCommand(command: string, cwd: string, showOutput: boolean = false, envVars: Record<string, string> = {}, miseVersion?: string | null): Promise<{ success: boolean; output: string; error: string; exitCode: number }> {
    return new Promise((resolve) => {
        let shellCommand: string;

        if (miseVersion) {
            // Use mise to activate the environment
            shellCommand = `cd "${cwd}" && eval "$(mise activate bash)" && ${command}`;
        } 
        else {
            // Fallback to regular command execution
            shellCommand = `cd "${cwd}" && ${command}`;
        }

        // Merge environment variables with process.env
        const env = { 
            ...process.env, 
            ...envVars
        };

        const child = spawn('bash', ['-c', shellCommand], {
            cwd: process.cwd(),
            stdio: 'pipe',
            env
        });

        let output = '';
        let error = '';

        child.stdout?.on('data', (data) => {
            const text = data.toString();
            output += text;
        });

        child.stderr?.on('data', (data) => {
            const text = data.toString();
            error += text;
        });

        child.on('close', (code) => {
            resolve({
                success: code === 0,
                output,
                error,
                exitCode: code || 0
            });
        });

        child.on('error', (err) => {
            resolve({
                success: false,
                output,
                error: err.message,
                exitCode: 1
            });
        });
    });
}
