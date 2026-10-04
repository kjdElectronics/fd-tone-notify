const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const log = require('./logger');

/**
 * SSL Certificate Management Utility
 * Handles automatic generation and management of self-signed SSL certificates
 */
class SSLManager {
    constructor() {
        this.sslDir = path.join(__dirname, '..', 'config', 'ssl');
        this.keyPath = path.join(this.sslDir, 'server.key');
        this.certPath = path.join(this.sslDir, 'server.crt');
    }

    /**
     * Ensure SSL certificates exist, generate if missing
     */
    async ensureCertificates() {
        try {
            // Create SSL directory if it doesn't exist
            await this.ensureSSLDirectory();

            // Check if certificates exist and are valid
            const problem = await this.certificatesExist()
                ? await this.certificateProblem()
                : 'SSL certificate files are missing';

            if (problem) {
                log.warning(problem);
                if (!await this.confirmRegenerate()) {
                    throw new Error(`${problem}; regeneration declined by user`);
                }
                log.info('Generating new self-signed SSL certificate...');
                await this.generateSelfSignedCertificate();
                log.info('SSL certificates generated successfully');
            } else {
                log.info('SSL certificates found and valid');
            }

            return {
                keyPath: this.keyPath,
                certPath: this.certPath
            };
        } catch (error) {
            log.error(`Failed to ensure SSL certificates: ${error.message}`);
            throw error;
        }
    }

    /**
     * Check if certificate files exist
     */
    async certificatesExist() {
        try {
            await fs.access(this.keyPath);
            await fs.access(this.certPath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Validate existing certificates
     * @returns {Promise<string|null>} description of the problem, or null if the certificate is usable
     */
    async certificateProblem() {
        try {
            const certContent = await fs.readFile(this.certPath, 'utf8');
            const cert = crypto.X509Certificate ? new crypto.X509Certificate(certContent) : null;

            if (cert) {
                const now = new Date();
                if (now > new Date(cert.validTo)) return `SSL certificate expired on ${cert.validTo}`;
                if (now < new Date(cert.validFrom)) return `SSL certificate not valid until ${cert.validFrom}`;
            }

            return null;
        } catch (error) {
            return `SSL certificate could not be read: ${error.message}`;
        }
    }

    /**
     * Ask the user whether to regenerate the certificate.
     * Without an interactive console (service / child process) this regenerates without asking.
     * Defaults to yes after a timeout so an unattended reboot never hangs startup.
     */
    async confirmRegenerate(timeoutMs = 30000) {
        if (!process.stdin.isTTY) return true;

        const readline = require('readline');
        const rl = readline.createInterface(process.stdin, process.stdout);
        return new Promise(resolve => {
            const timer = setTimeout(() => {
                console.log(`\nNo answer after ${timeoutMs / 1000}s, regenerating.`);
                rl.close();
                resolve(true);
            }, timeoutMs);
            rl.question(`Regenerate self-signed SSL certificate now? [Y/n] (auto-yes in ${timeoutMs / 1000}s): `, answer => {
                clearTimeout(timer);
                rl.close();
                resolve(!/^n/i.test(answer.trim()));
            });
        });
    }

    /**
     * Ensure SSL directory exists
     */
    async ensureSSLDirectory() {
        try {
            await fs.mkdir(this.sslDir, { recursive: true });
            
            // Create .gitignore to exclude certificates from git
            const gitignorePath = path.join(this.sslDir, '.gitignore');
            const gitignoreContent = '# SSL certificates should not be committed\n*.key\n*.crt\n*.pem\n';
            
            try {
                await fs.access(gitignorePath);
            } catch {
                await fs.writeFile(gitignorePath, gitignoreContent);
            }
        } catch (error) {
            log.error(`Failed to create SSL directory: ${error.message}`);
            throw error;
        }
    }

    /**
     * Generate self-signed SSL certificate
     */
    /**
     * Get all network interface IP addresses
     */
    getAllNetworkIPs() {
        const NetworkUtils = require('./network-utils');
        return NetworkUtils.getAllNetworkIPs();
    }

    async generateSelfSignedCertificate() {
        try {
            const os = require('os');
            const hostname = os.hostname();
            const allIPs = this.getAllNetworkIPs();
            
            log.info(`Generating SSL certificate for hostname: ${hostname}`);
            log.info(`Including IP addresses: ${allIPs.join(', ')}`);

            // Generate private key using cross-platform compatible syntax
            // Filenames are relative to sslDir (the OpenSSL cwd) so install paths containing
            // spaces are never split by the Windows shell
            await this.runOpenSSLCommand([
                'genrsa',
                '-out', path.basename(this.keyPath),
                '2048'
            ]);

            // Create config file for certificate with dynamic SANs
            const configPath = path.join(this.sslDir, 'openssl.conf');
            
            // Build alt_names section dynamically
            let altNamesSection = 'DNS.1 = localhost\n';
            if (hostname && hostname !== 'localhost') {
                altNamesSection += `DNS.2 = ${hostname}\n`;
            }
            
            // Add all detected IP addresses
            allIPs.forEach((ip, index) => {
                altNamesSection += `IP.${index + 1} = ${ip}\n`;
            });
            
            const configContent = `[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = Local
L = Local
O = FD-Tone-Notify
OU = IT
CN = localhost

[v3_req]
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
${altNamesSection}`;

            await fs.writeFile(configPath, configContent);

            // Generate certificate with SANs using cross-platform approach
            const certArgs = [
                'req',
                '-new',
                '-x509',
                '-key', path.basename(this.keyPath),
                '-out', path.basename(this.certPath),
                '-days', '365',
                '-config', path.basename(configPath),
                '-extensions', 'v3_req'
            ];
            
            await this.runOpenSSLCommand(certArgs);

            // Clean up config file
            await fs.unlink(configPath).catch(() => {});

            // Set appropriate permissions (cross-platform)
            try {
                await fs.chmod(this.keyPath, 0o600);
                await fs.chmod(this.certPath, 0o644);
            } catch (permError) {
                // On Windows, chmod might not work as expected, but files are still created
                log.debug(`Certificate permission setting skipped on this platform: ${permError.message}`);
            }

            log.info(`SSL certificate generated with Subject Alternative Names for network access`);
            log.info(`Certificate valid for ${allIPs.length} IP addresses and hostname: ${hostname}`);

        } catch (error) {
            log.error(`Failed to generate SSL certificate: ${error.message}`);
            throw error;
        }
    }

    /**
     * Run OpenSSL command
     */
    async runOpenSSLCommand(args) {
        return new Promise((resolve, reject) => {
            const { spawn } = require('child_process');
            const os = require('os');
            
            // Cross-platform OpenSSL command setup
            let command = 'openssl';
            let spawnOptions = { 
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: this.sslDir
            };
            
            // On Windows, we might need to handle shell commands differently
            if (os.platform() === 'win32') {
                spawnOptions.shell = true;
                // Try common Windows OpenSSL locations if standard command fails
            }
            
            log.debug(`Running OpenSSL command: ${command} ${args.join(' ')}`);
            
            const openssl = spawn(command, args, spawnOptions);

            let stdout = '';
            let stderr = '';

            openssl.stdout?.on('data', (data) => {
                stdout += data.toString();
            });

            openssl.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            openssl.on('close', (code) => {
                if (code === 0) {
                    log.debug(`OpenSSL command successful: ${args[0]}`);
                    resolve(stdout);
                } else {
                    const errorMsg = `OpenSSL command failed with code ${code}: ${stderr || 'No error details'}`;
                    log.error(errorMsg);
                    
                    // Provide helpful Windows-specific guidance
                    if (os.platform() === 'win32') {
                        log.error('Windows users: Ensure OpenSSL is installed and in PATH');
                        log.error('Download from: https://slproweb.com/products/Win32OpenSSL.html');
                        log.error('Or install via Chocolatey: choco install openssl');
                    }
                    
                    reject(new Error(errorMsg));
                }
            });

            openssl.on('error', (error) => {
                const errorMsg = `Failed to spawn OpenSSL: ${error.message}`;
                log.error(errorMsg);
                
                if (os.platform() === 'win32' && error.code === 'ENOENT') {
                    log.error('OpenSSL not found. Please install OpenSSL for Windows.');
                    log.error('Download from: https://slproweb.com/products/Win32OpenSSL.html');
                }
                
                reject(new Error(errorMsg));
            });
        });
    }

    /**
     * Get SSL certificate information
     */
    async getCertificateInfo() {
        try {
            if (!await this.certificatesExist()) {
                return null;
            }

            const certContent = await fs.readFile(this.certPath, 'utf8');
            const cert = crypto.X509Certificate ? new crypto.X509Certificate(certContent) : null;

            if (cert) {
                return {
                    subject: cert.subject,
                    issuer: cert.issuer,
                    validFrom: cert.validFrom,
                    validTo: cert.validTo,
                    fingerprint: cert.fingerprint,
                    serialNumber: cert.serialNumber
                };
            }

            return { exists: true, legacy: true };
        } catch (error) {
            log.error(`Failed to get certificate info: ${error.message}`);
            return null;
        }
    }
}

module.exports = new SSLManager();