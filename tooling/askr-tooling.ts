import fs from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildInputEntries, packageAliasEntries } from './platform-contract.ts';

const toolingDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolingDir, '..');

type LocalPackageMetadata = {
  name: string;
  version: string;
  buildLabel: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveRepoPath(sourcePath: string): string {
  return path.resolve(repoRoot, sourcePath);
}

function readLocalPackageMetadata(): LocalPackageMetadata {
  const packageJsonPath = resolveRepoPath('package.json');
  const packageJson = JSON.parse(
    fs.readFileSync(packageJsonPath, 'utf8')
  ) as Partial<Pick<LocalPackageMetadata, 'name' | 'version'>>;

  const name = packageJson.name?.trim() || '@askrjs/askr';
  const version = packageJson.version?.trim() || '0.0.0';

  return {
    name,
    version,
    buildLabel: `${version}-local`,
  };
}

const localPackageMetadata = readLocalPackageMetadata();

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
    source === '@askrjs/vite' ||
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

export const tier1BenchIncludes = ['benches/tier1/**/*.{ts,tsx}'] as const;

export const tier2BenchIncludes = ['benches/tier2/**/*.{ts,tsx}'] as const;

export const tier3BenchIncludes = ['benches/tier3/**/*.{ts,tsx}'] as const;

export const tier4BenchIncludes = ['benches/tier4/**/*.{ts,tsx}'] as const;

export const benchExcludes = ['benches/shared/_shared.*'] as const;

export function createNodeEnvDefine(
  mode: 'development' | 'production',
  options?: { bench?: boolean }
): Record<
  | 'process.env.NODE_ENV'
  | 'process.env.ASKR_BENCH'
  | 'process.env.ASKR_PACKAGE_NAME'
  | 'process.env.ASKR_PACKAGE_VERSION'
  | 'process.env.ASKR_BENCHMARK_BUILD_LABEL',
  string
> {
  return {
    'process.env.NODE_ENV': JSON.stringify(mode),
    'process.env.ASKR_BENCH': JSON.stringify(options?.bench ? '1' : '0'),
    'process.env.ASKR_PACKAGE_NAME': JSON.stringify(localPackageMetadata.name),
    'process.env.ASKR_PACKAGE_VERSION': JSON.stringify(
      localPackageMetadata.version
    ),
    'process.env.ASKR_BENCHMARK_BUILD_LABEL': JSON.stringify(
      localPackageMetadata.buildLabel
    ),
  };
}

export function createPackageAliases(): {
  find: RegExp;
  replacement: string;
}[] {
  return packageAliasEntries.map(([specifier, sourcePath]) => ({
    find: new RegExp(`^${escapeRegExp(specifier)}$`),
    replacement: resolveRepoPath(sourcePath),
  }));
}

export function createBuildInput(options?: {
  includeCli?: boolean;
}): Record<string, string> {
  const input = Object.fromEntries(
    buildInputEntries.map(([entryName, sourcePath]) => [
      entryName,
      resolveRepoPath(sourcePath),
    ])
  );

  if (options?.includeCli ?? true) {
    input['bin/askr-ssg'] = resolveRepoPath('src/bin/askr-ssg.ts');
  }

  return input;
}
