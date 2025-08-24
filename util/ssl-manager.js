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
    async generateSelfSignedCertificate() {
        try {
            const os = require('os');
            const hostname = os.hostname();

            // Generate private key using older, more compatible syntax
            await this.runOpenSSLCommand([
                'genrsa',
                '-out', this.keyPath,
                '2048'
            ]);

            //TODO Also do for public interfaces
            // Create config file for certificate with SANs
            const configPath = path.join(this.sslDir, 'openssl.conf');
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
DNS.1 = localhost
DNS.2 = ${hostname}
IP.1 = 127.0.0.1
IP.2 = ::1
`;

            await fs.writeFile(configPath, configContent);

            // Generate certificate with SANs
            await this.runOpenSSLCommand([
                'req',
                '-new',
                '-x509',
                '-key', this.keyPath,
                '-out', this.certPath,
                '-days', '365',
                '-config', configPath,
                '-extensions', 'v3_req'
            ]);

            // Clean up config file
            await fs.unlink(configPath).catch(() => {});

            // Set appropriate permissions
            await fs.chmod(this.keyPath, 0o600);
            await fs.chmod(this.certPath, 0o644);

            log.info('SSL certificate generated with Subject Alternative Names for network access');

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
            const openssl = spawn('openssl', args, { 
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: this.sslDir 
            });

            let stdout = '';
            let stderr = '';

            openssl.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            openssl.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            openssl.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout);
                } else {
                    reject(new Error(`OpenSSL command failed with code ${code}: ${stderr}`));
                }
            });

            openssl.on('error', (error) => {
                reject(new Error(`Failed to spawn OpenSSL: ${error.message}`));
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