import {
  createNodeEnvDefine,
  createPackageAliases,
  domBenchExcludes,
  domBenchIncludes,
  domTier3BenchIncludes,
  domTier4BenchIncludes,
  microBenchIncludes,
  ssrBenchIncludes,
} from './tooling/askr-tooling';

export {
  domBenchExcludes,
  domBenchIncludes,
  domTier3BenchIncludes,
  domTier4BenchIncludes,
  microBenchIncludes,
  ssrBenchIncludes,
};

export const benchDefine = createNodeEnvDefine('production', { bench: true });

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
  environment: 'jsdom' | 'node';
  include: readonly string[];
  exclude?: readonly string[];
  setupFiles?: readonly string[];
}) {
  return {
    environment: options.environment,
    globals: true,
    include: [...options.include],
    ...(options.setupFiles ? { setupFiles: [...options.setupFiles] } : {}),
    ...(options.exclude ? { exclude: [...options.exclude] } : {}),
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
