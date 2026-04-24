import { defineConfig } from 'vite-plus';
import {
  benchDefine,
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
  resolve: benchResolve,
});
