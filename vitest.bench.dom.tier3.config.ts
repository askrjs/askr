import { defineConfig } from 'vite-plus';
import {
  benchDefine,
  benchOxc,
  benchResolve,
  createBenchTestConfig,
  domBenchExcludes,
  domTier3BenchIncludes,
} from './vitest.bench.shared';

export default defineConfig({
  define: benchDefine,
  oxc: benchOxc,
  test: createBenchTestConfig({
    environment: 'jsdom',
    include: domTier3BenchIncludes,
    exclude: domBenchExcludes,
  }),
  resolve: benchResolve,
});
