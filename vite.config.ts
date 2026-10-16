import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages では /<リポジトリ名>/ap-prep/ で配信されるため、CI から BASE_PATH を渡す
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,webp}'],
      },
      manifest: {
        name: 'AP 過去問トレーナー',
        short_name: 'AP演習',
        description: '応用情報技術者試験 科目A の適応型過去問演習',
        lang: 'ja',
        theme_color: '#1f4fd1',
        background_color: '#f6f7f9',
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
