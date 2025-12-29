import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',

    resources: 'src/resources/index.ts',
    fx: 'src/fx/index.ts',
    router: 'src/router/index.ts',
    ssr: 'src/ssr/index.ts',

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
