import { defineConfig } from 'tsup';

export default defineConfig({
  // Include explicit entries for the JSX runtimes so tsup emits them to dist/jsx
  entry: [
    'src/index.ts',
    'src/jsx/jsx-runtime.ts',
    'src/jsx/jsx-dev-runtime.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
});
