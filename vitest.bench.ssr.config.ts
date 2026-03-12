import { defineConfig } from 'vitest/config';
import {
  benchDefine,
  benchEsbuild,
  benchResolve,
  createBenchTestConfig,
  ssrBenchIncludes,
} from './vitest.bench.shared';

export default defineConfig({
  define: benchDefine,
  test: createBenchTestConfig({
    environment: 'node',
    include: ssrBenchIncludes,
  }),
  esbuild: benchEsbuild,
  resolve: benchResolve,
});
