import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// claude.ai 上のアプリとして公開するため、ビルド後に scripts/inline.mjs で1枚の HTML にまとめる
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    // 1ファイルにまとめるので分割しない
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
