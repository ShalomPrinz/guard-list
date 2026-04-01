import { defineConfig, createLogger } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const logger = createLogger()
const loggerError = logger.error.bind(logger)
logger.error = (msg, options) => {
  if (msg.includes('http proxy error') && msg.includes('ECONNREFUSED')) return
  loggerError(msg, options)
}

export default defineConfig({
  customLogger: logger,
  plugins: [react()],
  server: {
    proxy: {
      '/api/kv': 'http://localhost:3001',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/logic/**', 'src/storage/**'],
      exclude: ['src/storage/index.ts'],
      thresholds: { lines: 90 },
    },
  },
})
