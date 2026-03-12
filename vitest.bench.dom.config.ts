import { defineConfig } from 'vitest/config';
import {
  benchDefine,
  benchEsbuild,
  benchResolve,
  createBenchTestConfig,
  domBenchExcludes,
  domBenchIncludes,
} from './vitest.bench.shared';

export default defineConfig({
  define: benchDefine,
  test: createBenchTestConfig({
    environment: 'jsdom',
    include: domBenchIncludes,
    exclude: domBenchExcludes,
  }),
  esbuild: benchEsbuild,
  resolve: benchResolve,
});
