#!/usr/bin/env node

/**
 * Restart Helper Process
 * 
 * This helper process is spawned when the main server needs to restart itself.
 * It waits for the main process to exit, then starts a new instance.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const log = require('../util/logger');

function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.error('Usage: restart-helper.js <main-process-pid> [restart-args...]');
        process.exit(1);
    }
    
    const mainProcessPid = parseInt(args[0]);
    const restartArgs = args.slice(1);
    
    if (isNaN(mainProcessPid)) {
        console.error('Invalid PID provided:', args[0]);
        process.exit(1);
    }
    
    console.log(`Restart helper started. Monitoring PID ${mainProcessPid}`);
    console.log(`Will restart with args: ${restartArgs.join(' ')}`);
    
    // Monitor the main process
    monitorMainProcess(mainProcessPid, restartArgs);
}

function monitorMainProcess(pid, restartArgs) {
    let checkCount = 0;
    const maxChecks = 30; // Maximum 30 seconds to wait for shutdown
    
    const checkInterval = setInterval(() => {
        checkCount++;
        
        try {
            // Check if process still exists
            process.kill(pid, 0);
            
            if (checkCount >= maxChecks) {
                console.error(`Main process ${pid} did not shut down within ${maxChecks} seconds. Force killing...`);
                try {
                    process.kill(pid, 'SIGKILL');
                } catch (error) {
                    console.error('Failed to force kill process:', error.message);
                }
                clearInterval(checkInterval);
                setTimeout(() => restartMainProcess(restartArgs), 1000);
            } else {
                console.log(`Waiting for main process ${pid} to shut down... (${checkCount}/${maxChecks})`);
            }
            
        } catch (error) {
            // Process doesn't exist anymore
            console.log(`Main process ${pid} has shut down successfully`);
            clearInterval(checkInterval);
            setTimeout(() => restartMainProcess(restartArgs), 1000);
        }
    }, 1000);
}

function restartMainProcess(restartArgs) {
    console.log('Starting new main process...');
    
    // Get the project root directory
    const projectRoot = path.dirname(__dirname);
    const mainScript = path.join(projectRoot, 'index.js');
    
    // Verify the main script exists
    if (!fs.existsSync(mainScript)) {
        console.error(`Main script not found: ${mainScript}`);
        process.exit(1);
    }
    
    // Prepare the command arguments
    const nodeArgs = ['node', mainScript, ...restartArgs];
    
    console.log(`Executing: ${nodeArgs.join(' ')}`);
    
    try {
        // Spawn the new process with stdio inheritance for console continuity
        const child = spawn('node', [mainScript, ...restartArgs], {
            cwd: projectRoot,
            stdio: ['inherit', 'inherit', 'inherit'], // Explicitly inherit stdin, stdout, stderr
            detached: false,  // Keep attached to maintain console session
            env: process.env  // Pass environment variables
        });
        
        child.on('spawn', () => {
            console.log(`New main process started with PID: ${child.pid}`);
            console.log('='.repeat(60));
            console.log('🔄 BACKEND RESTART COMPLETED - Console output continues below');
            console.log('='.repeat(60));
        });
        
        child.on('error', (error) => {
            console.error('Failed to start new main process:', error);
            process.exit(1);
        });
        
        child.on('exit', (code, signal) => {
            console.log(`Main process exited with code ${code}, signal ${signal}`);
            process.exit(code || 0);
        });
        
        // Don't unreference - let the helper exit when the main process exits
        // This maintains the console session continuity
        
    } catch (error) {
        console.error('Error spawning new main process:', error);
        process.exit(1);
    }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log('Restart helper interrupted');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Restart helper terminated');
    process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception in restart helper:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection in restart helper:', reason);
    process.exit(1);
});

// Start the helper
main();