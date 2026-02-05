import { defineConfig } from 'vite';
import path from 'path';

const isProd =
  process.env.NODE_ENV === 'production' || process.env.BUILD === 'production';

const input = {
  index: path.resolve(__dirname, 'src/index.ts'),

  'for/index': path.resolve(__dirname, 'src/for/index.ts'),
  'foundations/index': path.resolve(__dirname, 'src/foundations/index.ts'),

  'resources/index': path.resolve(__dirname, 'src/resources/index.ts'),
  'fx/index': path.resolve(__dirname, 'src/fx/index.ts'),
  'router/index': path.resolve(__dirname, 'src/router/index.ts'),
  'ssr/index': path.resolve(__dirname, 'src/ssr/index.ts'),

  'jsx-runtime': path.resolve(__dirname, 'src/jsx/jsx-runtime.ts'),
  'jsx-dev-runtime': path.resolve(__dirname, 'src/jsx/jsx-dev-runtime.ts'),

  // Bench entry for dist smoke tests (production build)
  benchmark: path.resolve(__dirname, 'src/bench/benchmark-entry.tsx'),

  'vite/index': path.resolve(__dirname, 'src/dev/vite-plugin-askr.ts'),
};

export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify(
      isProd ? 'production' : 'development'
    ),
  },
  build: {
    // Use rollup input to support multiple named entry points
    rollupOptions: {
      input,
      // Disable aggressive treeshaking for our multi-entry library bundle to ensure
      // entries that export utilities or entry functions (like `benchmark`) are
      // preserved even if not referenced by other modules.
      treeshake: false,
      // Force strict entry signature preservation to keep exports intact when
      // emitting as preserved modules.
      preserveEntrySignatures: 'strict',
      output: {
        // preserve module structure to ensure entry modules keep their exports
        preserveModules: true,
        preserveModulesRoot: 'src',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },

    sourcemap: !isProd,
    outDir: 'dist',
    emptyOutDir: true,
    minify: isProd,
  },
});
