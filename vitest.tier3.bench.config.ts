import { defineConfig } from 'vite-plus';
import {
  benchDefine,
  benchOxc,
  benchResolve,
  createBenchTestConfig,
  tier3BenchIncludes,
} from './vitest.bench.shared';

export default defineConfig({
  define: benchDefine,
  oxc: benchOxc,
  test: {
    projects: [
      {
        extends: true,
        test: createBenchTestConfig({
          name: 'tier3-jsdom',
          environment: 'jsdom',
          tier: 'tier3',
          include: tier3BenchIncludes,
          setupFiles: ['tests/setup-bench-env.ts'],
        }),
      },
    ],
  },
  resolve: benchResolve,
});
