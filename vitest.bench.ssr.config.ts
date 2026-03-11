import { defineConfig } from 'vitest/config';
import {
  benchDefine,
  benchEsbuild,
  benchResolve,
  ssrBenchIncludes,
} from './vitest.bench.shared';

export default defineConfig({
  define: benchDefine,
  test: {
    environment: 'node',
    globals: true,
    include: ssrBenchIncludes,
    fileParallelism: false,
    maxWorkers: 1,
    pool: 'forks',
    benchmark: {
      include: ssrBenchIncludes,
      includeSamples: false,
    },
  },
  esbuild: benchEsbuild,
  resolve: benchResolve,
});
