import { defineConfig } from 'vite';
import { askr } from '@askrjs/askr/vite';

export default defineConfig({
  plugins: [askr()],
  server: {
    port: 5173,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
