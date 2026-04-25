import { defineConfig } from 'vite-plus';
import {
  benchDefine,
  benchOxc,
  benchResolve,
  createBenchTestConfig,
  domBenchExcludes,
  domTier4BenchIncludes,
} from './vitest.bench.shared';

export default defineConfig({
  define: benchDefine,
  oxc: benchOxc,
  test: createBenchTestConfig({
    environment: 'jsdom',
    include: domTier4BenchIncludes,
    exclude: domBenchExcludes,
  }),
  resolve: benchResolve,
});
