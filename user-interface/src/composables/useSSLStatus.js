import { ref, computed, onMounted, onUnmounted } from 'vue'

export function useSSLStatus() {
    const backendSSLStatus = ref('unchecked') // 'valid', 'invalid', 'unchecked'
    const managerSSLStatus = ref('unchecked') // 'valid', 'invalid', 'unchecked'
    
    let checkInterval = null

    // Generate URLs based on current hostname and assumed ports
    function getBackendSSLUrl() {
        return `https://${window.location.hostname}:3000/`
    }
    
    function getManagerSSLUrl() {
        return `https://${window.location.hostname}:3001/`
    }

    // Check SSL certificate status for a service
    async function checkSSLCertificate(url) {
        try {
            // Make a simple fetch request to test SSL connectivity
            const response = await fetch(url, {
                method: 'HEAD',
                cache: 'no-cache',
                // Include credentials to match our CORS setup
                credentials: 'include'
            })
            
            // If we get any response (even 404), SSL certificate is valid
            return 'valid'
            
        } catch (error) {
            console.log(`SSL check for ${url}:`, error.message)
            
            // If it's a CORS error, SSL certificate is valid but CORS blocked the request
            if (error.message.includes('CORS') || 
                error.message.includes('cors') ||
                (error.name === 'TypeError' && !error.message.includes('fetch'))) {
                return 'valid'
            }
            
            // For any fetch failures that might indicate SSL issues, mark as invalid
            // This includes network errors, certificate errors, etc.
            return 'invalid'
        }
    }

    // Check both services
    async function checkAllSSLCertificates() {
        try {
            const [backendResult, managerResult] = await Promise.all([
                checkSSLCertificate(getBackendSSLUrl()),
                checkSSLCertificate(getManagerSSLUrl())
            ])
            
            backendSSLStatus.value = backendResult
            managerSSLStatus.value = managerResult
            
        } catch (error) {
            console.error('Error checking SSL certificates:', error)
        }
    }

    // Check if both SSL certificates are valid
    const allSSLValid = computed(() => {
        return backendSSLStatus.value === 'valid' && managerSSLStatus.value === 'valid'
    })

    // Check if any SSL certificates need attention
    const needsSSLSetup = computed(() => {
        return backendSSLStatus.value === 'invalid' || managerSSLStatus.value === 'invalid'
    })

    // Start periodic checking
    function startSSLMonitoring() {
        // Check immediately
        checkAllSSLCertificates()
        
        // Check every 30 seconds
        checkInterval = setInterval(checkAllSSLCertificates, 30000)
    }

    // Stop periodic checking
    function stopSSLMonitoring() {
        if (checkInterval) {
            clearInterval(checkInterval)
            checkInterval = null
        }
    }

    onMounted(() => {
        startSSLMonitoring()
    })

    onUnmounted(() => {
        stopSSLMonitoring()
    })

    return {
        backendSSLStatus,
        managerSSLStatus,
        allSSLValid,
        needsSSLSetup,
        getBackendSSLUrl,
        getManagerSSLUrl,
        checkAllSSLCertificates,
        startSSLMonitoring,
        stopSSLMonitoring
    }
}