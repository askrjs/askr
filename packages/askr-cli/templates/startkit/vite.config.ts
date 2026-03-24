import { defineConfig } from 'vite';
import { askr } from '@askrjs/askr-vite';

export default defineConfig({
  plugins: [askr()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    open: true,
    hmr: {
      host: '127.0.0.1',
      port: 5173,
      clientPort: 5173,
      protocol: 'ws',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
