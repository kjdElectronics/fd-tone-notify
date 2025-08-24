const chalk = require('chalk');

let shuttingDown = false;

function setupGracefulShutdown({processManager, apiServer}) {
    const gracefulShutdown = async (signal, isException = false) => {
        if (shuttingDown) {
            console.log(chalk.yellow(`Already shutting down, ignoring ${signal}`));
            return;
        }

        shuttingDown = true;

        if (isException) {
            console.log(chalk.red.bold(`\n💥 ${signal} - Starting emergency shutdown...`));
        } else {
            console.log(chalk.yellow(`\n🛑 Received ${signal}. Starting graceful shutdown...`));
        }

        try {
            // Create a timeout promise that will force exit after 10 seconds
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error('Graceful shutdown timeout after 10 seconds'));
                }, 5000);
            });

            // Create the shutdown promise
            const shutdownPromise = async () => {
                // Stop all child processes
                if (processManager) {
                    await processManager.stopAll();
                }

                // Stop manager API server
                if (apiServer) {
                    await apiServer.stop();
                }
            };

            // Race between shutdown completion and timeout - Fail the shutdown if we do not actually shutdonw
            await Promise.race([shutdownPromise(), timeoutPromise]);

            if (isException) {
                console.log(chalk.red.bold('❌ Uncaught Exception - See Logs Above'));
                process.exit(1);
            } else {
                console.log(chalk.green('✅ Graceful shutdown completed'));
                process.exit(0);
            }

        } catch (error) {
            if (error.message.includes('timeout')) {
                console.error(chalk.red('⚠️ Graceful shutdown timed out - force killing child processes'));

                // Force kill all child processes
                if (processManager) {
                    try {
                        const processes = processManager.processes;
                        if (processes.backend && processes.backend.pid) {
                            console.error(chalk.red(`Force killing backend process (PID: ${processes.backend.pid})`));
                            process.kill(processes.backend.pid, 'SIGKILL');
                        }
                        if (processes.ui && processes.ui.pid) {
                            console.error(chalk.red(`Force killing UI process (PID: ${processes.ui.pid})`));
                            process.kill(processes.ui.pid, 'SIGKILL');
                        }
                    } catch (killError) {
                        console.error(chalk.red('Error force killing processes:'), killError.message);
                    }
                }

                console.error(chalk.red('Forcing manager exit'));
                process.exit(1);
            } else {
                console.error(chalk.red('❌ Error during shutdown:'), error.message);
                process.exit(1);
            }
        }
    };

    // Handle normal signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
    // Windows-specific signal handling
    if (process.platform === 'win32') {
        // On Windows, we need to handle the SIGBREAK signal for Ctrl+Break
        process.on('SIGBREAK', () => gracefulShutdown('SIGBREAK'));
        
        // Handle Windows-specific close event
        process.on('beforeExit', () => {
            console.log(chalk.yellow('Process is about to exit...'));
        });
        
        // Additional Windows process events
        process.on('exit', (code) => {
            if (!shuttingDown && code !== 0) {
                console.log(chalk.red(`Process exiting with code ${code}`));
            }
        });
        
        // Try to capture Ctrl+C events on Windows more reliably
        process.stdin.resume(); // Keep process alive
        if (process.stdin.setRawMode) {
            try {
                process.stdin.setRawMode(true);
                process.stdin.on('data', (data) => {
                    const key = data.toString();
                    // Ctrl+C is character code 3
                    if (key.charCodeAt(0) === 3) {
                        gracefulShutdown('Ctrl+C');
                    }
                });
            } catch (rawModeError) {
                // Raw mode might not be available in all Windows environments
                console.log(chalk.gray('Raw mode not available, using standard signal handling'));
            }
        }
    }

    // Handle uncaught exceptions with special messaging
    process.on('uncaughtException', (error) => {
        console.error(chalk.red.bold('\n💥 UNCAUGHT EXCEPTION:'));
        console.error(chalk.red('Error:'), error.message);
        console.error(chalk.red('Stack:'), error.stack);
        console.error(chalk.red('Type:'), error.constructor.name);
        gracefulShutdown('Uncaught Exception', true);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error(chalk.red.bold('\n💥 UNHANDLED REJECTION:'));
        console.error(chalk.red('Reason:'), reason);
        console.error(chalk.red('Promise:'), promise);
        if (reason instanceof Error) {
            console.error(chalk.red('Stack:'), reason.stack);
        }
        gracefulShutdown('Unhandled Rejection', true);
    });
}

module.exports = { setupGracefulShutdown };