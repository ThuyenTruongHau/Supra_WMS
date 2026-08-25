import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss(), basicSsl()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    https: true,
    host: true,
    proxy: {
      '/api': {
        target: 'http://10.73.231.5:8001',
        changeOrigin: true,
        secure: false,
      },
      // Orchestrator local — tránh Mixed Content khi FE chạy HTTPS
      '/task': {
        target: 'http://localhost:6868',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})