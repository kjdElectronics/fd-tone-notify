#!/usr/bin/env node

const path = require('path');
const { spawn } = require('child_process');

/**
 * Start the FD Tone Notify Web UI
 * This script launches the UI server for configuration and monitoring
 */

console.log('🔥 Starting FD Tone Notify Web UI...');

// Change to the user-interface directory
process.chdir(path.join(__dirname, '..'));

// Check if we're in development mode
const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

let command, args;

if (isDev) {
    console.log('📦 Starting in development mode...');
    command = 'npm';
    args = ['run', 'dev'];
} else {
    console.log('🚀 Starting in production mode...');
    command = 'npm';
    args = ['start'];
}

// Spawn the process
const child = spawn(command, args, {
    stdio: 'inherit',
    shell: true
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down UI server...');
    child.kill('SIGINT');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down UI server...');
    child.kill('SIGTERM');
    process.exit(0);
});

child.on('close', (code) => {
    console.log(`\n🔥 UI server exited with code ${code}`);
    process.exit(code);
});

child.on('error', (err) => {
    console.error('❌ Failed to start UI server:', err);
    process.exit(1);
});