import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:2567' },
      '/matchmake': { target: 'http://localhost:2567' },
      '/ws': {
        target: 'ws://localhost:2567',
        ws: true,
        rewrite: (path) => path.replace(/^\/ws/, ''),
      },
    },
  },
  build: { chunkSizeWarningLimit: 800 },
});
