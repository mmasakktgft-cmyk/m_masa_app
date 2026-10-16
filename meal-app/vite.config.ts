import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages ではサブパス（/<リポジトリ名>/meal/）で配信されるため、CI から BASE_PATH を渡す
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
      },
      manifest: {
        name: 'ごはん記録',
        short_name: 'ごはん記録',
        description: '写真と Claude でかんたんに記録できる食事管理アプリ',
        lang: 'ja',
        theme_color: '#f5f7f2',
        background_color: '#f5f7f2',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
