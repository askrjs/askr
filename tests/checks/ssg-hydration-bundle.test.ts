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
    // SSR render-context storage resolves AsyncLocalStorage at run time; the
    // client bundle never imports the Node builtin, statically or lazily.
    for (const chunk of chunks) {
      expect([...chunk.imports, ...chunk.dynamicImports]).not.toContainEqual(
        expect.stringMatching(/async_hooks/)
      );
      expect(chunk.code).not.toMatch(
        /\b(?:import|require)\s*\([^)]*async_hooks/
      );
      // Strict CSP (no 'unsafe-eval') must not break hydration bundles.
      expect(chunk.code).not.toMatch(/\bnew Function\s*\(/);
    }

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
    // 264 KiB: #507 and #529 each fit 263 KiB alone but not together (the
    // production update-loop guard plus the derived-write guard; measured
    // 269,744 bytes on main after both merged).
    // Still within 264 KiB after For key and Case child validation started
    // shipping in production and control boundaries began recording an output
    // owner for ErrorBoundary routing (#441/#446, measured 269,556 bytes).
    // 265 KiB: client navigation tracks history entry indexes so a failed
    // back/forward returns to the rendered entry, and hands URLs no route can
    // render to the browser (~1.1 KB, #453-#455; measured 270,803 bytes).
    // 267 KiB for the DOM property path (`muted`, `indeterminate`, custom
    // element object props, `prop:`/`attr:`): the property table, resetting
    // removed properties, the URL/raw-HTML guards and rollback snapshots add
    // ~2.4 KB (measured 273,240 bytes). Without it those props cannot reach
    // the element at all.
    expect(initialBytes).toBeLessThanOrEqual(268 * 1024);
  });
});
