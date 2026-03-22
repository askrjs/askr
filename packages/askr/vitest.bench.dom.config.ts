import { defineConfig } from 'vitest/config';
import {
  benchDefine,
  benchEsbuild,
  benchOxc,
  benchResolve,
  createBenchTestConfig,
  domBenchExcludes,
  domBenchIncludes,
} from './vitest.bench.shared';

export default defineConfig({
  define: benchDefine,
  oxc: benchOxc,
  test: createBenchTestConfig({
    environment: 'jsdom',
    include: domBenchIncludes,
    exclude: domBenchExcludes,
  }),
  esbuild: benchEsbuild,
  resolve: benchResolve,
});
