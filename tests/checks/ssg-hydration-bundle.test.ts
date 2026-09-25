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

    expect(bundledModules).not.toContain('src/runtime/portal/portal.ts');
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

    // 257 KiB, raised from 256 KiB when the DOM and SSR renderers were given a
    // shared prop-classification table (boolean HTML attributes and camelCase
    // attribute names) so the two sides agree on what they emit. That data is
    // ~940 bytes and is required for hydration parity, not optional weight.
    // 260 KiB, raised again when the shared tables grew the SVG presentation
    // attribute names, the unitless CSS property list for numeric style `px`
    // units, and the enumerated attributes that render `false` (~2.5 KB).
    // Both renderers need them to emit the same, valid markup.
    // 262 KiB, raised again when prop reconciliation started diffing against
    // the props Askr last applied (instead of the live DOM) so attributes,
    // class tokens and style properties written by other code survive
    // re-renders. That ownership tracking, including its rollback snapshots
    // and reactive/static transitions, is ~1.8 KB of core renderer code
    // (measured 267,611 bytes, just over 261 KiB).
    // 263 KiB: fx lifecycle ownership (#468/#469) and the hydration auth
    // snapshot reader (#456) add ~0.9 KB of client code (measured 268,538 bytes).
    // Still within 263 KiB after production builds now keep the scheduler update-loop
    // guard (previously compiled out, so loops hung the page) plus the release
    // hooks that keep dropped work reschedulable, about 800 bytes.
    // 264 KiB: For key validation and Case child validation now ship in
    // production (they only ran in development, so production silently dropped
    // rows), and control boundaries record an output owner so their errors reach
    // the enclosing ErrorBoundary (#441/#446, measured 270,181 bytes).
    expect(initialBytes).toBeLessThanOrEqual(264 * 1024);
  });
});
