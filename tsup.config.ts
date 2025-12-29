import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',

    'foundations/index': 'src/foundations/index.ts',

    'resources/index': 'src/resources/index.ts',
    'fx/index': 'src/fx/index.ts',
    'router/index': 'src/router/index.ts',
    'ssr/index': 'src/ssr/index.ts',

    'jsx-runtime': 'src/jsx/jsx-runtime.ts',
    'jsx-dev-runtime': 'src/jsx/jsx-dev-runtime.ts',

    'vite/index': 'src/dev/vite-plugin-askr.ts',
  },

  outDir: 'dist',

  format: ['esm'],

  dts: true,
  sourcemap: true,
  clean: true,

  treeshake: true,
  splitting: false,

  esbuildOptions(options) {
    options.treeShaking = true;
  },
});
