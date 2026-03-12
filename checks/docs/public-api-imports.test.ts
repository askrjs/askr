import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');
const scanDirs = ['docs', 'examples'];
const scanFiles = ['README.md'];
const forbiddenPatterns = [
  {
    label: 'internal runtime import',
    pattern: /@askrjs\/askr\/runtime\//,
  },
  {
    label: 'fake ssr template export',
    pattern: /@askrjs\/askr\/ssr-template/,
  },
  {
    label: 'source-relative import',
    pattern: /\.\.\/src\//,
  },
];

function collectFiles(dirPath: string): string[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }
    files.push(fullPath);
  }

  return files;
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function probeDistExports(): unknown {
  const distDir = path.join(rootDir, 'dist');
  let lastError: unknown;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'askr-dist-'));

    try {
      fs.cpSync(distDir, snapshotDir, { recursive: true, force: true });
      const rootModuleHref = pathToFileURL(
        path.join(snapshotDir, 'index.js')
      ).href;
      const routerModuleHref = pathToFileURL(
        path.join(snapshotDir, 'router', 'index.js')
      ).href;

      const probe = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          `
            const rootModule = await import(${JSON.stringify(rootModuleHref)});
            const routerModule = await import(${JSON.stringify(
              routerModuleHref
            )});
            console.log(JSON.stringify({
              root: {
                derive: typeof rootModule.derive,
                state: typeof rootModule.state,
                selector: typeof rootModule.selector,
                route: typeof rootModule.route,
                navigate: typeof rootModule.navigate,
                registerRoute: typeof rootModule.registerRoute,
                Link: typeof rootModule.Link,
              },
              router: {
                route: typeof routerModule.route,
                navigate: typeof routerModule.navigate,
                Link: typeof routerModule.Link,
                layout: typeof routerModule.layout,
                hasRegisterRoute: Object.prototype.hasOwnProperty.call(
                  routerModule,
                  'registerRoute'
                ),
              },
            }));
          `,
        ],
        {
          cwd: rootDir,
          encoding: 'utf8',
        }
      );

      return JSON.parse(probe);
    } catch (error) {
      lastError = error;
      sleep(150);
    } finally {
      fs.rmSync(snapshotDir, { recursive: true, force: true });
    }
  }

  throw lastError;
}

describe('public docs and examples', () => {
  it('do not reference private or non-exported package paths', () => {
    const files = [
      ...scanFiles.map((file) => path.join(rootDir, file)),
      ...scanDirs.flatMap((dir) => collectFiles(path.join(rootDir, dir))),
    ];

    for (const file of files) {
      const contents = fs.readFileSync(file, 'utf8');

      for (const { label, pattern } of forbiddenPatterns) {
        expect(
          contents,
          `${label} in ${path.relative(rootDir, file)}`
        ).not.toMatch(pattern);
      }
    }
  });

  it('publish representative root and router exports from dist', () => {
    expect(probeDistExports()).toEqual({
      root: {
        derive: 'function',
        state: 'function',
        selector: 'function',
        route: 'function',
        navigate: 'function',
        registerRoute: 'function',
        Link: 'function',
      },
      router: {
        route: 'function',
        navigate: 'function',
        Link: 'function',
        layout: 'function',
        hasRegisterRoute: false,
      },
    });
  });
});
