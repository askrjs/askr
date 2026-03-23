import { defineConfig } from 'vitest/config';
import {
  benchDefine,
  benchEsbuild,
  benchOxc,
  benchResolve,
  createBenchTestConfig,
  ssrBenchIncludes,
} from './vitest.bench.shared';

export default defineConfig({
  define: benchDefine,
  oxc: benchOxc,
  test: createBenchTestConfig({
    environment: 'node',
    include: ssrBenchIncludes,
  }),
  esbuild: benchEsbuild,
  resolve: benchResolve,
});
