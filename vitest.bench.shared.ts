import {
  createNodeEnvDefine,
  createPackageAliases,
  benchExcludes,
  tier1BenchIncludes,
  tier2BenchIncludes,
  tier3BenchIncludes,
  tier4BenchIncludes,
} from './tooling/askr-tooling';

export {
  benchExcludes,
  tier1BenchIncludes,
  tier2BenchIncludes,
  tier3BenchIncludes,
  tier4BenchIncludes,
};

export const benchInstrumentationEnabled =
  process.env.ASKR_BENCH_INSTRUMENTATION === '1';

export const benchDefine = createNodeEnvDefine('production', {
  bench: benchInstrumentationEnabled,
});

export const benchPreciseClockEnabled =
  process.env.ASKR_BENCH_PRECISE_CLOCK === '1';

export const benchBrowserDefine = {
  ...benchDefine,
  __ASKR_BENCH_PRECISE_CLOCK__: JSON.stringify(benchPreciseClockEnabled),
};

export const benchBrowserServer = benchPreciseClockEnabled
  ? {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    }
  : undefined;

export const benchOxc = {
  jsx: {
    runtime: 'automatic' as const,
    importSource: '@askrjs/askr',
  },
};

export const benchResolve = {
  alias: createPackageAliases(),
};

export function createBenchTestConfig(options: {
  name: string;
  environment: 'jsdom' | 'node';
  tier: 'tier1' | 'tier2' | 'tier3' | 'tier4';
  include: readonly string[];
  exclude?: readonly string[];
  setupFiles?: readonly string[];
}) {
  return {
    name: options.name,
    environment: options.environment,
    globals: true,
    include: [...options.include],
    ...(options.exclude ? { exclude: [...options.exclude] } : {}),
    ...(options.setupFiles ? { setupFiles: [...options.setupFiles] } : {}),
    fileParallelism: false,
    maxWorkers: 1,
    pool: 'forks' as const,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    benchmark: {
      include: [...options.include],
      ...(options.exclude ? { exclude: [...options.exclude] } : {}),
      includeSamples: false,
    },
  };
}
