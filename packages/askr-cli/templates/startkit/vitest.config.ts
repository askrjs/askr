import { defineConfig } from 'vite-plus';
import { askr } from '@askrjs/askr-vite';

export default defineConfig({
  plugins: [askr()],
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: '@askrjs/askr',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
});
