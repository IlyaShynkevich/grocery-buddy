import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Grocery Buddy',
        short_name: 'Grocery Buddy',
        description: 'Personal grocery budget tracker',
        theme_color: '#16171d',
        background_color: '#16171d',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // HTML is deliberately excluded here — see the runtimeCaching entry
        // below for why. JS/CSS/images stay precached/cache-first as before.
        globPatterns: ['**/*.{js,css,png,svg,ico}'],
        // workbox-precaching's precacheAndRoute() registers its own
        // directoryIndex-based route (defaults to 'index.html') that
        // resolves "/" straight from the precache, registered before any
        // runtimeCaching route below and completely independent of this
        // navigateFallback setting — so index.html/login.html must be left
        // out of globPatterns entirely (above) for that route to have
        // nothing to match, or it wins regardless of what's configured here.
        // This line is set for clarity/intent, not because it alone does
        // anything once html is out of the precache manifest.
        navigateFallback: '',
        // Every navigation (mode: 'navigate' — the app shell request itself,
        // not JS/CSS/image sub-resources) must reach the real network first:
        // middleware.ts's auth gate only ever runs for actual requests
        // reaching Vercel, and a cache-first navigation would silently
        // bypass it forever for any returning visitor, not just a one-time
        // stale-SW transition. NetworkFirst still falls back to this cache
        // when genuinely offline, so an already-visited (and — since a
        // redirect gets followed and cached under the original URL — already
        // authenticated) user keeps working offline.
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 4,
            },
          },
        ],
      },
    }),
  ],
})
