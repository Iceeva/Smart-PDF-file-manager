import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// En local, les appels /api sont envoyes vers uvicorn (port 8000).
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600,
  },
})
