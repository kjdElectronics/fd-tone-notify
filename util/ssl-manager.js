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
            const certsExist = await this.certificatesExist();
            const certsValid = certsExist ? await this.certificatesValid() : false;

            if (!certsExist || !certsValid) {
                log.info('SSL certificates missing or invalid, generating new ones...');
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
     */
    async certificatesValid() {
        try {
            // Check if certificate is not expired
            const certContent = await fs.readFile(this.certPath, 'utf8');
            const cert = crypto.X509Certificate ? new crypto.X509Certificate(certContent) : null;
            
            if (cert) {
                const now = new Date();
                const notBefore = new Date(cert.validFrom);
                const notAfter = new Date(cert.validTo);
                
                if (now < notBefore || now > notAfter) {
                    log.warning('SSL certificate is expired or not yet valid');
                    return false;
                }
            }
            
            return true;
        } catch (error) {
            log.warning(`Certificate validation failed: ${error.message}`);
            return false;
        }
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
        const os = require('os');
        const networkInterfaces = os.networkInterfaces();
        const ips = new Set();
        
        // Always include standard localhost addresses
        ips.add('127.0.0.1');
        ips.add('::1');
        ips.add('0.0.0.0');
        
        // Add all detected network interface IPs
        for (const interfaceName of Object.keys(networkInterfaces)) {
            const addresses = networkInterfaces[interfaceName];
            for (const address of addresses) {
                // Skip internal/loopback that we already added
                if (!address.internal) {
                    ips.add(address.address);
                }
            }
        }
        
        return Array.from(ips);
    }

    async generateSelfSignedCertificate() {
        try {
            const os = require('os');
            const hostname = os.hostname();
            const allIPs = this.getAllNetworkIPs();
            
            log.info(`Generating SSL certificate for hostname: ${hostname}`);
            log.info(`Including IP addresses: ${allIPs.join(', ')}`);

            // Generate private key using cross-platform compatible syntax
            await this.runOpenSSLCommand([
                'genrsa',
                '-out', this.keyPath,
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
                '-key', this.keyPath,
                '-out', this.certPath,
                '-days', '365',
                '-config', configPath,
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