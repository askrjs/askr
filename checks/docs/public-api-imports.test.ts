import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';

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
      const componentsModuleHref = pathToFileURL(
        path.join(snapshotDir, 'components', 'index.js')
      ).href;
      const controlModuleHref = pathToFileURL(
        path.join(snapshotDir, 'control', 'index.js')
      ).href;
      const dataModuleHref = pathToFileURL(
        path.join(snapshotDir, 'data', 'index.js')
      ).href;
      const fxModuleHref = pathToFileURL(
        path.join(snapshotDir, 'fx', 'index.js')
      ).href;
      const ssgModuleHref = pathToFileURL(
        path.join(snapshotDir, 'ssg', 'index.js')
      ).href;
      const ssrModuleHref = pathToFileURL(
        path.join(snapshotDir, 'ssr', 'index.js')
      ).href;
      const bootModuleHref = pathToFileURL(
        path.join(snapshotDir, 'boot', 'index.js')
      ).href;
      const foundationsModuleHref = pathToFileURL(
        path.join(snapshotDir, 'foundations', 'index.js')
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
            const componentsModule = await import(${JSON.stringify(
              componentsModuleHref
            )});
            const controlModule = await import(${JSON.stringify(
              controlModuleHref
            )});
            const dataModule = await import(${JSON.stringify(dataModuleHref)});
            const fxModule = await import(${JSON.stringify(fxModuleHref)});
            const ssgModule = await import(${JSON.stringify(ssgModuleHref)});
            const ssrModule = await import(${JSON.stringify(ssrModuleHref)});
            const bootModule = await import(${JSON.stringify(bootModuleHref)});
            const foundationsModule = await import(${JSON.stringify(
              foundationsModuleHref
            )});
            console.log(JSON.stringify({
              root: {
                state: typeof rootModule.state,
                derive: typeof rootModule.derive,
                getSignal: typeof rootModule.getSignal,
                selector: typeof rootModule.selector,
                defineContext: typeof rootModule.defineContext,
                readContext: typeof rootModule.readContext,
                jsx: typeof rootModule.jsx,
                jsxs: typeof rootModule.jsxs,
                Fragment: typeof rootModule.Fragment,
                hasCreateIsland: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'createIsland'
                ),
                hasCreateSPA: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'createSPA'
                ),
                hasHydrateSPA: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'hydrateSPA'
                ),
                hasCleanupApp: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'cleanupApp'
                ),
                hasHasApp: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'hasApp'
                ),
                hasRoute: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'route'
                ),
                hasNavigate: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'navigate'
                ),
                hasResource: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'resource'
                ),
                hasCreateQuery: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'createQuery'
                ),
                hasCreateMutation: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'createMutation'
                ),
                hasInvalidate: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'invalidate'
                ),
                hasLink: Object.prototype.hasOwnProperty.call(rootModule, 'Link'),
                hasErrorBoundary: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'ErrorBoundary'
                ),
                hasFor: Object.prototype.hasOwnProperty.call(rootModule, 'For'),
                hasShow: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'Show'
                ),
                hasCase: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'Case'
                ),
                hasMatch: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'Match'
                ),
                hasPortal: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'Portal'
                ),
              },
              router: {
                route: typeof routerModule.route,
                currentRoute: typeof routerModule.currentRoute,
                navigate: typeof routerModule.navigate,
                Link: typeof routerModule.Link,
                group: typeof routerModule.group,
                fallback: typeof routerModule.fallback,
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
              components: {
                ErrorBoundary: typeof componentsModule.ErrorBoundary,
              },
              control: {
                For: typeof controlModule.For,
                Show: typeof controlModule.Show,
                Case: typeof controlModule.Case,
                Match: typeof controlModule.Match,
              },
              data: {
                createQuery: typeof dataModule.createQuery,
                createMutation: typeof dataModule.createMutation,
                invalidate: typeof dataModule.invalidate,
              },
              fx: {
                debounce: typeof fxModule.debounce,
                scheduleEventHandler: typeof fxModule.scheduleEventHandler,
              },
              ssg: {
                createStaticGen: typeof ssgModule.createStaticGen,
                hasBatchRenderRoutes: Object.prototype.hasOwnProperty.call(
                  ssgModule,
                  'batchRenderRoutes'
                ),
                hasWriteStaticFiles: Object.prototype.hasOwnProperty.call(
                  ssgModule,
                  'writeStaticFiles'
                ),
                hasResolveSsgData: Object.prototype.hasOwnProperty.call(
                  ssgModule,
                  'resolveSsgData'
                ),
                hasValidateRoutes: Object.prototype.hasOwnProperty.call(
                  ssgModule,
                  'validateRoutes'
                ),
              },
              ssr: {
                renderToString: typeof ssrModule.renderToString,
                renderToStringSync: typeof ssrModule.renderToStringSync,
                renderToStream: typeof ssrModule.renderToStream,
                resolveRequest: typeof ssrModule.resolveRequest,
                hasCollectResources: Object.prototype.hasOwnProperty.call(
                  ssrModule,
                  'collectResources'
                ),
                hasResolvePlan: Object.prototype.hasOwnProperty.call(
                  ssrModule,
                  'resolvePlan'
                ),
                hasResolveResources: Object.prototype.hasOwnProperty.call(
                  ssrModule,
                  'resolveResources'
                ),
                hasComponentAlias: Object.prototype.hasOwnProperty.call(
                  ssrModule,
                  'Component'
                ),
              },
              boot: {
                createIsland: typeof bootModule.createIsland,
                createSPA: typeof bootModule.createSPA,
                hydrateSPA: typeof bootModule.hydrateSPA,
                cleanupApp: typeof bootModule.cleanupApp,
                hasHasApp: Object.prototype.hasOwnProperty.call(
                  bootModule,
                  'hasApp'
                ),
                hasTeardownApp: Object.prototype.hasOwnProperty.call(
                  bootModule,
                  'teardownApp'
                ),
              },
              foundations: {
                layout: typeof foundationsModule.layout,
                Slot: typeof foundationsModule.Slot,
                definePortal: typeof foundationsModule.definePortal,
                DefaultPortal: typeof foundationsModule.DefaultPortal,
                Presence: typeof foundationsModule.Presence,
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
        state: 'function',
        derive: 'function',
        getSignal: 'function',
        selector: 'function',
        defineContext: 'function',
        readContext: 'function',
        jsx: 'function',
        jsxs: 'function',
        Fragment: 'symbol',
        hasCreateIsland: false,
        hasCreateSPA: false,
        hasHydrateSPA: false,
        hasCleanupApp: false,
        hasHasApp: false,
        hasRoute: false,
        hasNavigate: false,
        hasResource: false,
        hasCreateQuery: false,
        hasCreateMutation: false,
        hasInvalidate: false,
        hasLink: false,
        hasErrorBoundary: false,
        hasFor: false,
        hasShow: false,
        hasCase: false,
        hasMatch: false,
        hasPortal: false,
      },
      router: {
        route: 'function',
        currentRoute: 'function',
        navigate: 'function',
        Link: 'function',
        group: 'function',
        fallback: 'function',
        registerRoute: 'undefined',
      },
      resources: {
        resource: 'function',
        getSignal: 'function',
        on: 'function',
        hasDataResultAlias: false,
      },
      components: {
        ErrorBoundary: 'function',
      },
      control: {
        For: 'function',
        Show: 'function',
        Case: 'function',
        Match: 'function',
      },
      data: {
        createQuery: 'function',
        createMutation: 'function',
        invalidate: 'function',
      },
      fx: {
        debounce: 'function',
        scheduleEventHandler: 'function',
      },
      ssg: {
        createStaticGen: 'function',
        hasBatchRenderRoutes: false,
        hasWriteStaticFiles: false,
        hasResolveSsgData: false,
        hasValidateRoutes: false,
      },
      ssr: {
        renderToString: 'function',
        renderToStringSync: 'function',
        renderToStream: 'function',
        resolveRequest: 'function',
        hasCollectResources: false,
        hasResolvePlan: false,
        hasResolveResources: false,
        hasComponentAlias: false,
      },
      boot: {
        createIsland: 'function',
        createSPA: 'function',
        hydrateSPA: 'function',
        cleanupApp: 'function',
        hasHasApp: true,
        hasTeardownApp: false,
      },
      foundations: {
        layout: 'function',
        Slot: 'function',
        definePortal: 'function',
        DefaultPortal: 'function',
        Presence: 'function',
      },
    });
  }, 30000);
});
