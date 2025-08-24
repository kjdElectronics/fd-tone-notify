const os = require('os');

/**
 * Network utility functions for managing IP addresses and CORS origins
 */
class NetworkUtils {
    /**
     * Get all network IP addresses for the current device
     * @returns {string[]} Array of IP addresses
     */
    static getAllNetworkIPs() {
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

    /**
     * Get all allowed CORS origins based on current network configuration
     * @returns {string[]} Array of allowed origin URLs
     */
    static getAllowedCORSOrigins() {
        const ips = this.getAllNetworkIPs();
        const origins = new Set();

        // Add localhost variants
        origins.add('http://localhost');
        origins.add('https://localhost');
        origins.add('http://127.0.0.1');
        origins.add('https://127.0.0.1');

        // Add all detected IPs with both HTTP and HTTPS
        for (const ip of ips) {
            if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '0.0.0.0') {
                origins.add(`http://${ip}`);
                origins.add(`https://${ip}`);
            }
        }

        return Array.from(origins);
    }

    /**
     * Check if an origin is allowed based on current network configuration
     * @param {string} origin - The origin to check
     * @returns {boolean} True if origin is allowed
     */
    static isOriginAllowed(origin) {
        if (!origin) {
            // Allow requests with no origin (mobile apps, desktop apps, etc.)
            return true;
        }

        // Get current allowed origins
        const allowedOrigins = this.getAllowedCORSOrigins();
        
        // Check for exact matches first
        for (const allowedOrigin of allowedOrigins) {
            if (origin.startsWith(allowedOrigin)) {
                return true;
            }
        }

        // Check localhost variants (with any port)
        if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            return true;
        }

        // Check if it's from any of our detected network IPs (with any port)
        const ips = this.getAllNetworkIPs();
        for (const ip of ips) {
            if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '0.0.0.0') {
                if (origin.includes(ip)) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Create CORS origin validation function
     * @returns {Function} CORS origin validation function
     */
    static createCORSOriginValidator() {
        return (origin, callback) => {
            if (this.isOriginAllowed(origin)) {
                return callback(null, true);
            }

            // Reject all other origins
            const error = new Error(`CORS policy does not allow access from origin: ${origin}`);
            error.status = 403;
            return callback(error, false);
        };
    }
}

module.exports = NetworkUtils;