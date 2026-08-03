import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { build, type Rollup } from 'vite';
import {
  askrEsbuild,
  createNodeEnvDefine,
  createPackageAliases,
} from '../../tooling/askr-tooling';

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const fixtureRoot = join(
  repoRoot,
  'tests',
  'checks',
  'fixtures',
  'ssg-hydration'
);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

function outputs(
  result: Rollup.RollupOutput | Rollup.RollupOutput[] | Rollup.RollupWatcher
): Array<Rollup.OutputAsset | Rollup.OutputChunk> {
  if ('on' in result) {
    throw new Error(
      'The SSG hydration fixture unexpectedly entered watch mode.'
    );
  }
  return (Array.isArray(result) ? result : [result]).flatMap(
    (output) => output.output
  );
}

describe('SSG hydration bundle', () => {
  it('should omit unused portal, authoring, and deferred capabilities', async () => {
    const outDir = await mkdtemp(join(tmpdir(), 'askr-ssg-hydration-'));
    temporaryDirectories.push(outDir);

    const result = await build({
      root: fixtureRoot,
      logLevel: 'silent',
      define: createNodeEnvDefine('production'),
      esbuild: askrEsbuild,
      resolve: { alias: createPackageAliases() },
      build: {
        outDir,
        emptyOutDir: true,
        minify: true,
        sourcemap: false,
        write: false,
      },
    });
    const chunks = outputs(result).filter(
      (output): output is Rollup.OutputChunk => output.type === 'chunk'
    );
    const bundledModules = new Set(
      chunks.flatMap((chunk) =>
        Object.keys(chunk.modules).map((module) => relative(repoRoot, module))
      )
    );

    expect(bundledModules).not.toContain('src/runtime/portal.ts');
    expect(bundledModules).not.toContain('src/router/authoring.ts');
    expect(bundledModules).not.toContain('src/router/deferred.tsx');

    const chunksByFileName = new Map(
      chunks.map((chunk) => [chunk.fileName, chunk])
    );
    const initialChunks = new Set<Rollup.OutputChunk>();
    const collectStaticImports = (chunk: Rollup.OutputChunk): void => {
      if (initialChunks.has(chunk)) return;
      initialChunks.add(chunk);
      for (const imported of chunk.imports) {
        const importedChunk = chunksByFileName.get(imported);
        if (importedChunk) collectStaticImports(importedChunk);
      }
    };
    for (const entry of chunks.filter((chunk) => chunk.isEntry)) {
      collectStaticImports(entry);
    }
    const initialBytes = Array.from(initialChunks).reduce(
      (total, chunk) => total + Buffer.byteLength(chunk.code),
      0
    );

    expect(initialBytes).toBeLessThanOrEqual(256 * 1024);
  });
});
