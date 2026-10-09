import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

const srcDir = path.resolve(import.meta.dirname, './src')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendTarget = env.VITE_BACKEND_URL || process.env.VITE_BACKEND_URL || 'http://localhost:8000'
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'robots.txt'],
        manifest: {
          name: 'E-Rakshak Telecom Multilateration Platform',
          short_name: 'E-Rakshak',
          description: 'Law Enforcement Telecom CDR Multilateration & Suspect Pinpointing Platform',
          theme_color: '#0F1B2D',
          background_color: '#090E17',
          display: 'standalone',
          orientation: 'portrait',
          icons: [
            {
              src: '/favicon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json}'],
          runtimeCaching: [
            {
              // Cache map tiles (OpenStreetMap, CartoDB, Esri, ArcGis)
              urlPattern: /^https:\/\/(?:[a-c]\.tile\.openstreetmap\.org|[a-d]\.basemaps\.cartocdn\.com|server\.arcgisonline\.com|tile\.openstreetmap\.org)\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'map-tiles-cache',
                expiration: {
                  maxEntries: 2500,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 Days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              // Cache Google Fonts stylesheets & webfonts
              urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
              },
            },
            {
              // Cache Leaflet CDN CSS/JS
              urlPattern: /^https:\/\/unpkg\.com\/leaflet.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'leaflet-assets-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 90,
                },
              },
            },
          ],
        },
      }),
    ],
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
