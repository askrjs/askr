import { resolve } from 'node:path';

import { defineConfig } from 'vite-plus';

const srcRoot = resolve(__dirname, 'src');

export default defineConfig({
  fmt: {
    semi: true,
    singleQuote: true,
    trailingComma: 'es5',
    printWidth: 80,
    tabWidth: 2,
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: '@askrjs/askr',
  },
  build: {
    minify: false,
    sourcemap: true,
    lib: {
      entry: {
        index: resolve(srcRoot, 'index.ts'),
        'components/composites/field/field': resolve(
          srcRoot,
          'components/composites/field/field.tsx'
        ),
      },
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
