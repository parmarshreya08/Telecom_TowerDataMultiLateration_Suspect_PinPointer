import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const srcDir = path.resolve(import.meta.dirname, './src')

export default defineConfig(({ mode }) => {
  // Env-driven backend target: VITE_BACKEND_URL=http://localhost:8124 npm run dev.
  // Defaults to the backend's own default PORT (8000) — a stale hardcoded 8124
  // is what produced "[vite] ws proxy error: socket hang up".
  const env = loadEnv(mode, process.cwd(), '')
  const backendTarget = env.VITE_BACKEND_URL || process.env.VITE_BACKEND_URL || 'http://localhost:8000'
  return {
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': srcDir,
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
        ws: true,
      },
      '/health': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
  }
})
