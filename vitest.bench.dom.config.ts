import { defineConfig } from 'vitest/config';
import {
  benchDefine,
  benchEsbuild,
  benchResolve,
  domBenchExcludes,
  domBenchIncludes,
} from './vitest.bench.shared';

export default defineConfig({
  define: benchDefine,
  test: {
    environment: 'jsdom',
    globals: true,
    include: domBenchIncludes,
    exclude: domBenchExcludes,
    fileParallelism: false,
    maxWorkers: 1,
    pool: 'forks',
    benchmark: {
      include: domBenchIncludes,
      exclude: domBenchExcludes,
      includeSamples: false,
    },
  },
  esbuild: benchEsbuild,
  resolve: benchResolve,
});
