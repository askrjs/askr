import { defineConfig } from "vite";

const externalPackagePattern = /^@askrjs\/(?:askr|askr-ui)(?:\/.*)?$/;

export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "@askrjs/askr",
  } as any,
  build: {
    minify: false,
    sourcemap: true,
    lib: {
      entry: "src/index.ts",
    },
    rollupOptions: {
      external: (id) => externalPackagePattern.test(id),
      output: [
        {
          dir: "dist",
          entryFileNames: "[name].js",
          exports: "named",
          format: "es",
          preserveModules: true,
          preserveModulesRoot: "src",
        },
      ],
    },
  },
});
