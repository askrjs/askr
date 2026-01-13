import { defineConfig } from 'tsup';

const isProd =
  process.env.NODE_ENV === 'production' || process.env.BUILD === 'production';

export default defineConfig({
  entry: {
    index: 'src/index.ts',

    'for/index': 'src/for/index.ts',
    'foundations/index': 'src/foundations/index.ts',
    'foundations/core': 'src/foundations/core.ts',
    'foundations/structures': 'src/foundations/structures.ts',

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
  sourcemap: !isProd,
  clean: true,

  treeshake: true,
  splitting: isProd,
  minify: isProd,

  esbuildOptions(options) {
    options.treeShaking = true;
  },
});
