import { defineConfig } from 'vite-plus';
import {
  benchDefine,
  benchOxc,
  benchResolve,
  createBenchTestConfig,
  tier1BenchIncludes,
} from './vitest.bench.shared';

export default defineConfig({
  define: benchDefine,
  oxc: benchOxc,
  test: {
    projects: [
      {
        extends: true,
        test: createBenchTestConfig({
          name: 'tier1-node',
          environment: 'node',
          tier: 'tier1',
          include: [
            'benches/tier1/tier1-hotpath-router-*.ts',
            'benches/tier1/tier1-hotpath-scheduler-flush.ts',
            'benches/tier1/tier1-hotpath-ssr-*.{ts,tsx}',
          ],
        }),
      },
      {
        extends: true,
        test: createBenchTestConfig({
          name: 'tier1-jsdom',
          environment: 'jsdom',
          tier: 'tier1',
          include: ['benches/tier1/tier1-hotpath-*.tsx'],
          exclude: ['benches/tier1/tier1-hotpath-ssr-*.tsx'],
          setupFiles: ['tests/setup-bench-env.ts'],
        }),
      },
    ],
  },
  resolve: benchResolve,
});
