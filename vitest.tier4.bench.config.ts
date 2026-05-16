import { defineConfig } from 'vite-plus';
import {
  benchDefine,
  benchOxc,
  benchResolve,
  createBenchTestConfig,
  tier4BenchIncludes,
} from './vitest.bench.shared';

export default defineConfig({
  define: benchDefine,
  oxc: benchOxc,
  test: {
    projects: [
      {
        extends: true,
        test: createBenchTestConfig({
          name: 'tier4-jsdom',
          environment: 'jsdom',
          tier: 'tier4',
          include: tier4BenchIncludes,
          setupFiles: ['tests/setup-bench-env.ts'],
        }),
      },
    ],
  },
  resolve: benchResolve,
});
