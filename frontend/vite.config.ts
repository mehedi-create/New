// frontend/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    open: false,
  },
  preview: {
    port: 5174,
    strictPort: true,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: true,
  },
  css: {
    devSourcemap: true,
  },
  define: {
    'process.env': {}, // avoid process undefined errors in some libs
  },
});