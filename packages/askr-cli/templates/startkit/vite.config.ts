import { defineConfig } from 'vite-plus';
import { askr } from '@askrjs/askr-vite';

export default defineConfig({
  plugins: [askr()],
  lint: {
    ignorePatterns: ['dist/**', 'node_modules/**', 'coverage/**'],
    options: {
      typeAware: false,
      typeCheck: false,
    },
  },
  fmt: {
    semi: true,
    singleQuote: true,
    trailingComma: 'es5',
    printWidth: 80,
    tabWidth: 2,
  },
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
