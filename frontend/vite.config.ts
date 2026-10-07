import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const srcDir = path.resolve(import.meta.dirname, './src')

export default defineConfig({
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
        target: 'http://localhost:8124',
        changeOrigin: true,
        ws: true,
      },
      '/health': {
        target: 'http://localhost:8124',
        changeOrigin: true,
      },
    },
  },
})
