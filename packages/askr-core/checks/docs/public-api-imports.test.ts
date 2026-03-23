import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');
const monorepoRootDir = path.resolve(rootDir, '..', '..');
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
  if (!fs.existsSync(dirPath)) {
    return [];
  }
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
      const resourcesModuleHref = pathToFileURL(
        path.join(snapshotDir, 'resources', 'index.js')
      ).href;
      const fxModuleHref = pathToFileURL(
        path.join(snapshotDir, 'fx', 'index.js')
      ).href;
      const bootModuleHref = pathToFileURL(
        path.join(snapshotDir, 'boot', 'index.js')
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
            const resourcesModule = await import(${JSON.stringify(
              resourcesModuleHref
            )});
            const fxModule = await import(${JSON.stringify(fxModuleHref)});
            const bootModule = await import(${JSON.stringify(bootModuleHref)});
            console.log(JSON.stringify({
              root: {
                derive: typeof rootModule.derive,
                state: typeof rootModule.state,
                selector: typeof rootModule.selector,
                route: typeof rootModule.route,
                navigate: typeof rootModule.navigate,
                resource: typeof rootModule.resource,
                Link: typeof rootModule.Link,
                hasCreateApp: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'createApp'
                ),
                hasHydrateAlias: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'hydrate'
                ),
                hasAppConfigAlias: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'AppConfig'
                ),
                hasRegisterRoute: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'registerRoute'
                ),
                hasDebounce: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'debounce'
                ),
                hasRenderToString: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'renderToString'
                ),
              },
              router: {
                route: typeof routerModule.route,
                navigate: typeof routerModule.navigate,
                Link: typeof routerModule.Link,
                layout: typeof routerModule.layout,
                registerRoute: typeof routerModule.registerRoute,
              },
              resources: {
                resource: typeof resourcesModule.resource,
                getSignal: typeof resourcesModule.getSignal,
                on: typeof resourcesModule.on,
                hasDataResultAlias: Object.prototype.hasOwnProperty.call(
                  resourcesModule,
                  'DataResult'
                ),
              },
              fx: {
                debounce: typeof fxModule.debounce,
                scheduleEventHandler: typeof fxModule.scheduleEventHandler,
              },
              boot: {
                createIsland: typeof bootModule.createIsland,
                createSPA: typeof bootModule.createSPA,
                hydrateSPA: typeof bootModule.hydrateSPA,
                cleanupApp: typeof bootModule.cleanupApp,
                hasHydrateAlias: Object.prototype.hasOwnProperty.call(
                  bootModule,
                  'hydrate'
                ),
                hasAppConfigAlias: Object.prototype.hasOwnProperty.call(
                  bootModule,
                  'AppConfig'
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
    const rootsToScan = [rootDir, monorepoRootDir].filter((dirPath) =>
      fs.existsSync(dirPath)
    );
    const files = [
      ...rootsToScan.flatMap((scanRoot) =>
        scanFiles
          .map((file) => path.join(scanRoot, file))
          .filter((filePath) => fs.existsSync(filePath))
      ),
      ...rootsToScan.flatMap((scanRoot) =>
        scanDirs.flatMap((dir) => collectFiles(path.join(scanRoot, dir)))
      ),
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
        resource: 'function',
        Link: 'function',
        hasCreateApp: false,
        hasHydrateAlias: false,
        hasAppConfigAlias: false,
        hasRegisterRoute: false,
        hasDebounce: false,
        hasRenderToString: false,
      },
      router: {
        route: 'function',
        navigate: 'function',
        Link: 'function',
        layout: 'function',
        registerRoute: 'undefined',
      },
      resources: {
        resource: 'function',
        getSignal: 'function',
        on: 'function',
        hasDataResultAlias: false,
      },
      fx: {
        debounce: 'function',
        scheduleEventHandler: 'function',
      },
      boot: {
        createIsland: 'function',
        createSPA: 'function',
        hydrateSPA: 'function',
        cleanupApp: 'function',
        hasHydrateAlias: false,
        hasAppConfigAlias: false,
      },
    });
  });
});
