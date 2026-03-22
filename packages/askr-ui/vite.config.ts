import { resolve } from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: '@askrjs/askr',
  },
  build: {
    minify: false,
    sourcemap: true,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
    },
    rollupOptions: {
      external: (id) => /^@askrjs\/askr(?:\/.*)?$/.test(id),
      output: [
        {
          dir: 'dist',
          entryFileNames: '[name].js',
          exports: 'named',
          format: 'es',
          preserveModules: true,
          preserveModulesRoot: 'src',
        },
        {
          dir: 'dist',
          entryFileNames: '[name].cjs',
          exports: 'named',
          format: 'cjs',
          preserveModules: true,
          preserveModulesRoot: 'src',
        },
      ],
    },
  },
});
