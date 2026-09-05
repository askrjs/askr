import { defineConfig } from 'vite-plus';
import {
  askrEsbuild,
  createBuildInput,
  createNodeEnvDefine,
  createPackageAliases,
  isBuildExternal,
  nodeBuiltins,
} from './tooling/askr-tooling.ts';
import { relative, resolve } from 'node:path';

const isProd =
  process.env.NODE_ENV === 'production' || process.env.BUILD === 'production';
const input = createBuildInput();

export default defineConfig({
  define: createNodeEnvDefine(isProd ? 'production' : 'development', {
    // Package and application builds never carry benchmark instrumentation.
    // Vitest benchmark configs opt into it explicitly.
    bench: false,
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
    // Published declarations are authoritative contracts, including names and
    // documentation. Emitting adapter declarations leaks private binding names.
    dts: false,
    copy: [
      {
        from: 'src/compatibility/contracts/**/*.d.ts',
        rename: (_name, _extension, fullPath) =>
          relative(resolve('src/compatibility/contracts'), fullPath),
      },
    ],
    // Keep maps for diagnostics without publishing dangling sourceMappingURL
    // comments or map files in the package tarball.
    sourcemap: 'hidden',
    unbundle: false,
    treeshake: true,
    // Package artifacts are always production runtime artifacts. Development
    // behavior is provided by the source-based dev/test configurations above.
    define: createNodeEnvDefine('production'),
    deps: {
      neverBundle: ['vite', 'esbuild', '@askrjs/vite', ...nodeBuiltins],
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
