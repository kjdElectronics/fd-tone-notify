const { spawn } = require('child_process');
const path = require('path');
const chalk = require('chalk');

/**
 * ProcessManager handles spawning, monitoring, and controlling child processes
 * for the backend server and UI development server.
 */
class ProcessManager {
    constructor(logAggregator, statusMonitor, options = {}) {
        this.logAggregator = logAggregator;
        this.statusMonitor = statusMonitor;
        this.options = options;
        
        this.processes = {
            backend: null,
            ui: null
        };
        
        this.processStatus = {
            backend: 'stopped',
            ui: 'stopped'
        };
        
        this.detectedPorts = {
            ui: null
        };
    }

    /**
     * Start the backend server process
     */
    async startBackend() {
        if (this.processes.backend) {
            throw new Error('Backend process is already running');
        }

        return new Promise((resolve, reject) => {
            /*Internally, the legacy is option is used. This option is required to clearly communicate to users that
             the "legacy" backend is one component of the larger system. However, the "legacy" system remains the core
             of the system and is the backend.
             */
            const args = ['--legacy', '--web-server'];
            
            // Add port if specified
            if (this.options.backendPort && this.options.backendPort !== '3000') {
                args.push('--port', this.options.backendPort);
            }
            
            // Add other backend options
            if (this.options.instanceName) {
                args.push('--instance-name', this.options.instanceName);
            }
            
            if (this.options.recordingDirectory) {
                args.push('--recording-directory', this.options.recordingDirectory);
            }
            
            if (this.options.secretsFile) {
                args.push('--secrets-file', this.options.secretsFile);
            }
            
            if (this.options.forceSecretsFile) {
                args.push('--force-secrets-file');
            }
            
            if (this.options.debug) {
                args.push('--debug');
            }

            const backendPath = path.join(__dirname, '..', 'index.js');
            
            this.logAggregator.log('BACKEND', `Starting backend: node ${backendPath} ${args.join(' ')}`);
            
            const child = spawn('node', ["--expose-gc", backendPath, ...args], {
                cwd: path.dirname(__dirname),
                env: process.env,
                stdio: 'pipe'
            });

            this.processes.backend = child;
            this.processStatus.backend = 'starting';
            
            // Setup stdio piping with error handling
            try {
                this.logAggregator.attachProcess('BACKEND', child, this);
            } catch (error) {
                this.logAggregator.log('BACKEND', chalk.red(`Failed to attach logging: ${error.message}`), 'error');
            }
            
            // Monitor process events
            child.on('spawn', () => {
                this.processStatus.backend = 'running';
                this.statusMonitor.updateStatus('backend', 'running', child.pid);
                this.logAggregator.log('BACKEND', chalk.green('✅ Backend process started successfully'), 'success');
                resolve();
            });

            child.on('error', (error) => {
                this.processStatus.backend = 'error';
                this.statusMonitor.updateStatus('backend', 'error', null, error.message);
                this.logAggregator.log('BACKEND', chalk.red(`❌ Backend process error: ${error.message}`), 'error');
                reject(error);
            });

            child.on('exit', (code, signal) => {
                this.processStatus.backend = 'stopped';
                this.statusMonitor.updateStatus('backend', 'stopped', null);
                this.processes.backend = null;
                
                const message = signal 
                    ? `Backend process exited with signal ${signal}`
                    : `Backend process exited with code ${code}`;
                    
                this.logAggregator.log('BACKEND', chalk.yellow(`🔄 ${message}`), code === 0 ? 'info' : 'warning');
            });

            // Set a timeout for startup
            setTimeout(() => {
                if (this.processStatus.backend === 'starting') {
                    this.logAggregator.log('BACKEND', chalk.green('Backend startup completed'), 'success');
                }
            }, 500);
        });
    }

    /**
     * Start the UI development server process
     */
    async startUI() {
        if (this.processes.ui) {
            throw new Error('UI process is already running');
        }

        return new Promise((resolve, reject) => {
            const uiPath = path.join(__dirname, '..', 'user-interface');
            
            this.logAggregator.log('UI', `Starting UI dev server in ${uiPath}`);

            const child = spawn('npm', ['run', 'dev'], {
                cwd: uiPath,
                env: process.env,
                stdio: 'pipe',
                shell: true
            });

            this.processes.ui = child;
            this.processStatus.ui = 'starting';
            
            // Setup stdio piping with error handling
            try {
                this.logAggregator.attachProcess('UI', child, this);
            } catch (error) {
                this.logAggregator.log('UI', chalk.red(`Failed to attach logging: ${error.message}`), 'error');
            }
            
            // Monitor process events
            child.on('spawn', () => {
                this.processStatus.ui = 'running';
                this.statusMonitor.updateStatus('ui', 'running', child.pid);
                this.logAggregator.log('UI', chalk.green('✅ UI dev server started successfully'), 'success');
            });

            child.on('error', (error) => {
                this.processStatus.ui = 'error';
                this.statusMonitor.updateStatus('ui', 'error', null, error.message);
                this.logAggregator.log('UI', chalk.red(`❌ UI process error: ${error.message}`), 'error');
                reject(error);
            });

            child.on('exit', (code, signal) => {
                this.processStatus.ui = 'stopped';
                this.statusMonitor.updateStatus('ui', 'stopped', null);
                this.processes.ui = null;
                
                const message = signal 
                    ? `UI process exited with signal ${signal}`
                    : `UI process exited with code ${code}`;
                    
                this.logAggregator.log('UI', chalk.yellow(`🔄 ${message}`), code === 0 ? 'info' : 'warning');
            });

            // Give the start a second to process, then resolve
            setTimeout(() => {
                resolve();
            }, 1000);
        });
    }

    /**
     * Stop the backend server process
     */
    async stopBackend() {
        if (!this.processes.backend) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            this.logAggregator.log('BACKEND', chalk.yellow('🛑 Stopping backend process...'));
            
            const child = this.processes.backend;
            this.processStatus.backend = 'stopping';
            
            // Setup exit handler
            const onExit = () => {
                this.logAggregator.log('BACKEND', chalk.green('✅ Backend process stopped'));
                resolve();
            };
            
            child.once('exit', onExit);
            
            // TODO: Backend is never shutting down without being forced. This is likely due to 
            // event handlers that are not cleaned up with the tone detection system. We should 
            // not need to force exit once event handler cleanup is properly implemented.
            
            // Try SIGTERM first, then force kill after short timeout
            try {
                child.kill('SIGTERM');
                this.logAggregator.log('BACKEND', chalk.yellow('Attempting graceful shutdown...'));
            } catch (e) {
                // Process might already be dead
            }
            
            // Force kill after very short timeout (since graceful shutdown is broken)
            setTimeout(() => {
                if (this.processes.backend === child) {
                    this.logAggregator.log('BACKEND', chalk.red('⚠️ Force killing backend process'));
                    try {
                        child.kill('SIGKILL');
                    } catch (e) {
                        // Process might already be dead
                    }
                }
            }, 4000);
        });
    }

    /**
     * Stop the UI development server process
     */
    async stopUI() {
        if (!this.processes.ui) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            this.logAggregator.log('UI', chalk.yellow('🛑 Stopping UI dev server...'));
            
            const child = this.processes.ui;
            this.processStatus.ui = 'stopping';
            
            // Setup exit handler
            const onExit = () => {
                this.logAggregator.log('UI', chalk.green('✅ UI dev server stopped'));
                resolve();
            };
            
            child.once('exit', onExit);
            
            // We need to call task kill on windows for the UI
            if (process.platform === 'win32') {
                const args = ['/PID', this.processes.ui.pid, '/T', '/F']; // /T = entire tree, /F = force
                const child = spawn('taskkill', args);
            } else {
                child.kill('SIGTERM');
            }
            
            // Force kill after timeout (shorter on Windows due to signal handling issues)
            const timeout = 2000;
            setTimeout(() => {
                if (this.processes.ui === child) {
                    this.logAggregator.log('UI', chalk.red('⚠️ Force killing UI process'));
                    child.kill('SIGKILL');
                }
            }, timeout);
        });
    }

    /**
     * Restart the backend server process
     */
    async restartBackend() {
        this.logAggregator.log('BACKEND', chalk.cyan('🔄 Restarting backend...'));
        
        if (this.processes.backend) {
            await this.stopBackend();
        }
        
        // Small delay to ensure clean restart
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        await this.startBackend();
        this.logAggregator.log('BACKEND', chalk.green('✅ Backend restart completed'));
    }

    /**
     * Stop all managed processes
     */
    async stopAll() {
        const promises = [];
        
        if (this.processes.backend) {
            promises.push(this.stopBackend());
        }
        
        if (this.processes.ui) {
            promises.push(this.stopUI());
        }
        
        await Promise.all(promises);

        //Wait to make sure there is exits
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    /**
     * Get status of all processes
     */
    getStatus() {
        return {
            backend: {
                status: this.processStatus.backend,
                pid: this.processes.backend?.pid || null,
                running: this.processStatus.backend === 'running'
            },
            ui: {
                status: this.processStatus.ui,
                pid: this.processes.ui?.pid || null,
                running: this.processStatus.ui === 'running',
                port: this.detectedPorts.ui
            }
        };
    }

    /**
     * Get the detected UI port
     */
    getUIPort() {
        return this.detectedPorts.ui;
    }
}

module.exports = ProcessManager;