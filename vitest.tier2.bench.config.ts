import { defineConfig } from 'vite-plus';
import {
  benchDefine,
  benchOxc,
  benchResolve,
  createBenchTestConfig,
  tier2BenchIncludes,
} from './vitest.bench.shared';

export default defineConfig({
  define: benchDefine,
  oxc: benchOxc,
  test: {
    projects: [
      {
        extends: true,
        test: createBenchTestConfig({
          name: 'tier2-node',
          environment: 'node',
          tier: 'tier2',
          include: ['benches/tier2/tier2-subsystem-ssr-*.{ts,tsx}'],
        }),
      },
      {
        extends: true,
        test: createBenchTestConfig({
          name: 'tier2-jsdom',
          environment: 'jsdom',
          tier: 'tier2',
          include: ['benches/tier2/tier2-subsystem-*.tsx'],
          exclude: ['benches/tier2/tier2-subsystem-ssr-*.tsx'],
          setupFiles: ['tests/setup-bench-env.ts'],
        }),
      },
    ],
  },
  resolve: benchResolve,
});
