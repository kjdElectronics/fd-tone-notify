#!/usr/bin/env node

/**
 * FD Tone Notify Manager
 * 
 * Unified process manager for the FD Tone Notify system.
 * Manages backend server and UI development server as child processes
 * with unified console output and coordinated control.
 */

require('dotenv').config();
const { program } = require('commander');
const chalk = require('chalk');
const { checkDefaultPassword } = require('../util/password-checker');

const ProcessManager = require('../manager/process-manager');
const LogAggregator = require('../manager/log-aggregator');
const ApiServer = require('../manager/api-server');
const StatusMonitor = require('../manager/status-monitor');
const {setupGracefulShutdown} = require("../manager/setupGracefulShutdown");

// Manager state
let processManager;
let logAggregator;
let apiServer;
let statusMonitor;

function setupProgram() {
    program
        .name('fd-tone-notify-manager')
        .description('Unified process manager for FD Tone Notify system')
        .option('--backend-only', 'Start only the backend server (no UI dev server)')
        .option('--ui-only', 'Start only the UI dev server (no backend)')
        .option('--backend-port <port>', 'Backend server port (default: 3000)', '3000')
        .option('--manager-port <port>', 'Manager API port (default: 3001)', '3001')
        .option('--debug', 'Enable debug logging')
        .option('--instance-name <name>', 'Backend instance name for config files')
        .option('--recording-directory <path>', 'Recording directory path')
        .option('--secrets-file <path>', 'Path to secrets file')
        .option('--force-secrets-file', 'Force all secrets from file')
        .parse();
}

async function main() {
    console.log(chalk.cyan.bold('🔥 FD Tone Notify Manager Starting...'));
    console.log(chalk.gray('FDTN Manager Provides unified logging and management of child processes\n'));

    const options = program.opts();

    try {
        // Initialize components
        logAggregator = new LogAggregator();
        statusMonitor = new StatusMonitor();
        processManager = new ProcessManager(logAggregator, statusMonitor, options);
        apiServer = new ApiServer(processManager, statusMonitor, options);

        // Setup graceful shutdown
        setupGracefulShutdown({processManager, apiServer});

        // Start manager API server
        await apiServer.start();

        // Start processes based on options
        if (!options.uiOnly) {
            console.log(chalk.yellow('🚀 Starting backend server...'));
            await processManager.startBackend();
        }

        if (!options.backendOnly) {
            console.log(chalk.yellow('🎨 Starting UI dev server...'));
            await processManager.startUI();
        }

        if(statusMonitor.getStatus().healthy)
            console.log(chalk.green.bold('\n✅ FD Tone Notify Ready!'));
        else {
            console.log(chalk.redBright.bold('\n❌ FD Tone Notify Has Not Fully Started. Check Sub-system status below and check for errors above!'));
        }
        
        // Display status table
        await displayStartupSummary(processManager, statusMonitor, logAggregator, options);
        
        // Check if default password is in use and show reminder
        await checkDefaultPassword(options);
        
        console.log(chalk.gray('\nProcess logs will appear below:'));
        logAggregator.logSeparator('LIVE PROCESS LOGS');

        // Keep the process alive
        process.stdin.resume();

    } catch (error) {
        console.error(chalk.red.bold('❌ Manager startup failed:'), error.message);
        process.exit(1);
    }
}

async function displayStartupSummary(processManager, statusMonitor, logAggregator, options) {
    // Give processes a moment to fully initialize and detect ports
    await new Promise(resolve => setTimeout(resolve, 2000));

    const processStatus = processManager.getStatus();
    
    // Prepare table data
    const tableData = [
        [
            'Manager Status', 
            `PID ${process.pid}`, 
            '✓ Running'
        ],
        [
            'Manager API', 
            `https://localhost:${options.managerPort}`, 
            '✓ Listening'
        ]
    ];
    
    // Add backend info if started
    if (!options.uiOnly) {
        const backendStatus = processStatus.backend;
        const backendUrl = `https://localhost:${options.backendPort}`;
        let backendStatusText = '✗ Failed to Start';
        
        if (backendStatus.running) {
            backendStatusText = `✓ Running (PID ${backendStatus.pid})`;
        } else if (backendStatus.status === 'starting') {
            backendStatusText = '⚠ Starting...';
        }
        
        tableData.push([
            'Backend Server', 
            backendUrl, 
            backendStatusText
        ]);
    }
    
    // Add UI info if started
    if (!options.backendOnly) {
        const uiStatus = processStatus.ui;
        const detectedPort = processManager.getUIPort();
        const uiUrl = `https://localhost:${detectedPort}`;
        let uiStatusText = '✗ Failed to Start';
        
        if (uiStatus.running) {
            const portInfo = uiStatus.port ? ` Port ${uiStatus.port}` : ` Port ${detectedPort}`;
            uiStatusText = `✓ Running (PID ${uiStatus.pid}${portInfo})`;
        } else if (uiStatus.status === 'starting') {
            uiStatusText = '⚠ Starting...';
        }
        
        tableData.push([
            'UI Dev Server', 
            uiUrl, 
            uiStatusText
        ]);
    }
    
    // Add WebSocket info
    tableData.push([
        'Manager WebSocket', 
        `ws://localhost:${options.managerPort}/ws`, 
        '✓ Available'
    ]);
    
    if (!options.uiOnly) {
        tableData.push([
            'Backend WebSocket', 
            `ws://localhost:${options.backendPort}/api/websocket`, 
            processStatus.backend.running ? '✓ Available' : '✗ Unavailable'
        ]);
    }
    
    // Display the formatted table
    console.log(''); // Add spacing
    logAggregator.logStatusTable(`🔥 FD TONE NOTIFY SYSTEM STATUS ${statusMonitor.getStatus().healthy ? '✅' : '🛑'}`, tableData);
    
    // Add usage instructions
    console.log(chalk.green.bold.underline('\n 📋 Quick Start:'));

    if(!statusMonitor.getStatus().healthy){
        console.log(chalk.bold.red.underline(`   • ❌ Startup error. All systems are NOT GO 🛑!  Check for errors above.`));
    }

    if (!options.backendOnly) {
        const detectedPort = processManager.getUIPort();
        console.log(chalk.bold.green(`   • Open web interface: ${chalk.white(`https://localhost:${detectedPort}`)}`));
    }

    if (options.backendOnly) {
        console.log(chalk.gray(`   • Backend API: ${chalk.white(`https://localhost:${options.backendPort}`)}`));
    }

    console.log(chalk.gray('   • Press Ctrl+C to stop all processes gracefully'));
}

// Initialize and start
setupProgram();
main().catch(error => {
    console.error(chalk.red.bold('💥 Fatal error:'), error);
    process.exit(1);
});