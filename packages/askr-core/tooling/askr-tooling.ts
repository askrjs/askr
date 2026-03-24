import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolingDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolingDir, '..');

const packageSourceEntries = {
  '@askrjs/askr/jsx-runtime': 'src/jsx/jsx-runtime.ts',
  '@askrjs/askr/jsx-dev-runtime': 'src/jsx/jsx-dev-runtime.ts',
  '@askrjs/askr/for': 'src/for/index.ts',
  '@askrjs/askr/foundations': 'src/foundations/index.ts',
  '@askrjs/askr/resources': 'src/resources/index.ts',
  '@askrjs/askr/fx': 'src/fx/index.ts',
  '@askrjs/askr/router': 'src/router/index.ts',
  '@askrjs/askr/ssr': 'src/ssr/index.ts',
  '@askrjs/askr/ssg': 'src/ssg/index.ts',
  '@askrjs/askr': 'src/index.ts',
} as const satisfies Record<string, string>;

const buildSourceEntries = {
  index: 'src/index.ts',
  'boot/index': 'src/boot/index.ts',
  'for/index': 'src/for/index.ts',
  'foundations/index': 'src/foundations/index.ts',
  'resources/index': 'src/resources/index.ts',
  'fx/index': 'src/fx/index.ts',
  'router/index': 'src/router/index.ts',
  'ssr/index': 'src/ssr/index.ts',
  'ssg/index': 'src/ssg/index.ts',
  'jsx-runtime': 'src/jsx/jsx-runtime.ts',
  'jsx-dev-runtime': 'src/jsx/jsx-dev-runtime.ts',
  benchmark: 'src/bench/benchmark-entry.tsx',
} as const satisfies Record<string, string>;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveRepoPath(sourcePath: string): string {
  return path.resolve(repoRoot, sourcePath);
}

const bareNodeBuiltins = new Set(
  builtinModules.map((moduleName) => moduleName.replace(/^node:/, ''))
);

export const nodeBuiltins = Array.from(
  new Set([
    ...bareNodeBuiltins,
    ...Array.from(bareNodeBuiltins, (moduleName) => `node:${moduleName}`),
  ])
).sort();

export function isBuildExternal(source: string): boolean {
  return (
    source === '@askrjs/askr-vite' ||
    source === 'vite' ||
    source === 'esbuild' ||
    source.startsWith('node:') ||
    bareNodeBuiltins.has(source)
  );
}

export const askrEsbuild = {
  jsx: 'automatic',
  jsxImportSource: '@askrjs/askr',
} as const;

export const domBenchIncludes = [
  'benches/tier1/**/*.{ts,tsx}',
  'benches/tier2/**/*.{ts,tsx}',
  'benches/tier3/**/*.{ts,tsx}',
  'benches/tier4/**/*.tsx',
] as const;

export const domBenchExcludes = [
  'benches/**/*-ssr-*',
  'benches/shared/_shared.*',
] as const;

export const ssrBenchIncludes = [
  'benches/tier1/**/tier1-hotpath-ssr-*.{ts,tsx}',
  'benches/tier2/**/tier2-subsystem-ssr-*.{ts,tsx}',
] as const;

export function createNodeEnvDefine(
  mode: 'development' | 'production',
  options?: { bench?: boolean }
): Record<'process.env.NODE_ENV' | 'process.env.ASKR_BENCH', string> {
  return {
    'process.env.NODE_ENV': JSON.stringify(mode),
    'process.env.ASKR_BENCH': JSON.stringify(options?.bench ? '1' : '0'),
  };
}

export function createPackageAliases(): {
  find: RegExp;
  replacement: string;
}[] {
  return Object.entries(packageSourceEntries).map(
    ([specifier, sourcePath]) => ({
      find: new RegExp(`^${escapeRegExp(specifier)}$`),
      replacement: resolveRepoPath(sourcePath),
    })
  );
}

export function createBuildInput(options?: {
  includeCli?: boolean;
}): Record<string, string> {
  const input = Object.fromEntries(
    Object.entries(buildSourceEntries).map(([entryName, sourcePath]) => [
      entryName,
      resolveRepoPath(sourcePath),
    ])
  );

  if (options?.includeCli ?? true) {
    input['bin/askr-ssg'] = resolveRepoPath('src/bin/askr-ssg.ts');
  }

  return input;
}
