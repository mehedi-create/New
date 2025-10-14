// frontend/vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  optimizeDeps: {
    include: ['ethers', 'axios', 'react', 'react-dom', 'react-router-dom'],
  },
})
