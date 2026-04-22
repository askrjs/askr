import { defineConfig } from 'vite-plus';
import {
  askrEsbuild,
  createBuildInput,
  createNodeEnvDefine,
  createPackageAliases,
  isBuildExternal,
  nodeBuiltins,
} from './tooling/askr-tooling.ts';

const isProd =
  process.env.NODE_ENV === 'production' || process.env.BUILD === 'production';
const isBenchBuild = process.env.BUILD === 'bench';
const input = createBuildInput({ includeCli: !isBenchBuild });

export default defineConfig({
  define: createNodeEnvDefine(isProd ? 'production' : 'development', {
    bench: isBenchBuild,
  }),
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
  esbuild: askrEsbuild,
  resolve: {
    alias: createPackageAliases(),
  },
  pack: {
    entry: createBuildInput(),
    format: ['esm'],
    outDir: 'dist',
    platform: 'neutral',
    tsconfig: 'tsconfig.pack.json',
    dts: true,
    sourcemap: true,
    unbundle: true,
    treeshake: false,
    define: createNodeEnvDefine(isProd ? 'production' : 'development'),
    deps: {
      neverBundle: ['vite', 'esbuild', '@askrjs/askr-vite', ...nodeBuiltins],
    },
  },
  build: {
    modulePreload: false,
    // Use rollup input to support multiple named entry points
    rollupOptions: {
      input,
      external: isBuildExternal,
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
