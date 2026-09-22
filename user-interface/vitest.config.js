import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// Minimal vitest setup covering stores/utilities (no DOM/component rendering
// needed for those), separate from the Vite dev/build config so the app
// build isn't affected by test-only settings.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
