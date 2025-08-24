#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');

console.log('🔥 Setting up FD Tone Notify Web UI...\n');

async function setup() {
    try {
        // Check Node.js version
        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
        
        if (majorVersion < 16) {
            console.error('❌ Node.js 16 or higher is required');
            console.error(`   Current version: ${nodeVersion}`);
            process.exit(1);
        }
        
        console.log(`✅ Node.js version: ${nodeVersion}`);
        
        // Create .env file if it doesn't exist
        const envPath = path.join(__dirname, '..', '.env');
        const envExamplePath = path.join(__dirname, '..', '.env.example');
        
        if (!await fs.pathExists(envPath)) {
            if (await fs.pathExists(envExamplePath)) {
                await fs.copy(envExamplePath, envPath);
                console.log('✅ Created .env file from template');
            } else {
                // Create basic .env file
                const basicEnv = `UI_PORT=3001
UI_HOST=localhost
UI_PASSWORD_HASH=$2b$10$EyHr7.C0LLV375X8BAMkPeRKNBWjHEJWqluFc8EEFGXAqMc8X5Sju
MAIN_API_URL=http://localhost:2090/api
NODE_ENV=development
`;
                await fs.writeFile(envPath, basicEnv);
                console.log('✅ Created basic .env file');
            }
        } else {
            console.log('✅ .env file already exists');
        }
        
        // Ensure temp directories exist
        const tempDirs = [
            path.join(__dirname, '..', 'temp-uploads'),
            path.join(__dirname, '../../temp-uploads')
        ];
        
        for (const dir of tempDirs) {
            await fs.ensureDir(dir);
        }
        console.log('✅ Created temporary directories');
        
        // Install dependencies
        console.log('\n📦 Installing dependencies...');
        await runCommand('npm', ['install'], { cwd: path.join(__dirname, '..') });
        
        // Build frontend
        console.log('\n🏗️  Building frontend...');
        await runCommand('npm', ['run', 'build'], { cwd: path.join(__dirname, '..') });
        
        console.log('\n🎉 Setup complete!');
        console.log('\nNext steps:');
        console.log('1. Review .env file and update UI_PASSWORD_HASH');
        console.log('2. Start the UI: npm start');
        console.log('3. Access at: http://localhost:3001');
        console.log('\nFor development: npm run dev');
        
    } catch (error) {
        console.error('\n❌ Setup failed:', error.message);
        process.exit(1);
    }
}

function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: 'inherit',
            shell: true,
            ...options
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command failed with exit code ${code}`));
            }
        });
        
        child.on('error', reject);
    });
}

setup();