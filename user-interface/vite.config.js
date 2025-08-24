import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import fs from 'fs'

// SSL certificate paths (same as backend)
const sslKeyPath = path.resolve(__dirname, '../config/ssl/server.key')
const sslCertPath = path.resolve(__dirname, '../config/ssl/server.crt')

// Check if SSL certificates exist
let httpsConfig = false
try {
  if (fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
    httpsConfig = {
      key: fs.readFileSync(sslKeyPath),
      cert: fs.readFileSync(sslCertPath)
    }
  }
} catch (error) {
  console.warn('SSL certificates not found for Vite dev server, falling back to HTTP')
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3003,
    host: '0.0.0.0', // Bind to all interfaces for network access
    https: httpsConfig,
    proxy: {
      '/api': {
        target: process.env.VITE_MANAGER_URL || 'https://localhost:3001',
        changeOrigin: true,
        secure: false, // Allow self-signed certificates
      },
      '/socket.io': {
        target: process.env.VITE_MANAGER_URL || 'https://localhost:3001',
        changeOrigin: true,
        secure: false, // Allow self-signed certificates
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})