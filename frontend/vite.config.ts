import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:9105',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: '../static/dist',
    emptyOutDir: true,
    sourcemap: false,
  },
});
