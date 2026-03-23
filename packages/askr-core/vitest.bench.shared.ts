import {
  askrEsbuild,
  createNodeEnvDefine,
  createPackageAliases,
  domBenchExcludes,
  domBenchIncludes,
  ssrBenchIncludes,
} from './tooling/askr-tooling';

export { domBenchExcludes, domBenchIncludes, ssrBenchIncludes };

export const benchDefine = createNodeEnvDefine('production', { bench: true });

export const benchEsbuild = askrEsbuild;

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
}) {
  return {
    environment: options.environment,
    globals: true,
    include: [...options.include],
    ...(options.exclude ? { exclude: [...options.exclude] } : {}),
    fileParallelism: false,
    maxWorkers: 1,
    pool: 'forks' as const,
    benchmark: {
      include: [...options.include],
      ...(options.exclude ? { exclude: [...options.exclude] } : {}),
      includeSamples: false,
    },
  };
}
