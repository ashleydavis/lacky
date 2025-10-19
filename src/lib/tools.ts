import { execSync } from 'child_process';

// Check if mise is installed and get version
export function checkMiseInstallation(): string | null {
    try {
        const version = execSync('mise --version', {
            shell: '/bin/bash',
            encoding: 'utf-8',
            stdio: 'pipe'
        }).trim();
        return version;
    } 
    catch (error) {
        return null;
    }
}
