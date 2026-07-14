import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');
const monorepoRootDir = path.resolve(rootDir, '..', '..');
const scanDirs = ['docs', 'examples'];
const scanFiles = ['README.md'];
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
) as {
  exports: Record<string, unknown>;
};
const validPublicSpecifiers = new Set(
  ['@askrjs/askr'].concat(
    Object.keys(packageJson.exports)
      .filter((key) => key !== '.')
      .map((key) => `@askrjs/askr/${key.replace(/^\.\//, '')}`)
  )
);
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
    label: 'deprecated root boot import',
    pattern: /import\s*{[^}]*createIsland[^}]*}\s*from\s*['"]@askrjs\/askr['"]/,
  },
  {
    label: 'deprecated root spa import',
    pattern: /import\s*{[^}]*createSPA[^}]*}\s*from\s*['"]@askrjs\/askr['"]/,
  },
  {
    label: 'deprecated root hydration import',
    pattern: /import\s*{[^}]*hydrateSPA[^}]*}\s*from\s*['"]@askrjs\/askr['"]/,
  },
  {
    label: 'deprecated root cleanup import',
    pattern: /import\s*{[^}]*cleanupApp[^}]*}\s*from\s*['"]@askrjs\/askr['"]/,
  },
  {
    label: 'deprecated root has-app import',
    pattern: /import\s*{[^}]*hasApp[^}]*}\s*from\s*['"]@askrjs\/askr['"]/,
  },
  {
    label: 'deprecated root boundary import',
    pattern:
      /import\s*{[^}]*ErrorBoundary[^}]*}\s*from\s*['"]@askrjs\/askr['"]/,
  },
  {
    label: 'deprecated root resource import',
    pattern: /import\s*{[^}]*resource[^}]*}\s*from\s*['"]@askrjs\/askr['"]/,
  },
  {
    label: 'deprecated root query import',
    pattern: /import\s*{[^}]*createQuery[^}]*}\s*from\s*['"]@askrjs\/askr['"]/,
  },
  {
    label: 'deprecated root mutation import',
    pattern:
      /import\s*{[^}]*createMutation[^}]*}\s*from\s*['"]@askrjs\/askr['"]/,
  },
  {
    label: 'deprecated root invalidate import',
    pattern: /import\s*{[^}]*invalidate[^}]*}\s*from\s*['"]@askrjs\/askr['"]/,
  },
  {
    label: 'deprecated root route import',
    pattern: /import\s*{[^}]*route[^}]*}\s*from\s*['"]@askrjs\/askr['"]/,
  },
  {
    label: 'deprecated root navigate import',
    pattern: /import\s*{[^}]*navigate[^}]*}\s*from\s*['"]@askrjs\/askr['"]/,
  },
  {
    label: 'deprecated root link import',
    pattern: /import\s*{[^}]*Link[^}]*}\s*from\s*['"]@askrjs\/askr['"]/,
  },
  {
    label: 'deprecated root outlet import',
    pattern: /import\s*{[^}]*Outlet[^}]*}\s*from\s*['"]@askrjs\/askr['"]/,
  },
  {
    label: 'deprecated root current-route import',
    pattern: /import\s*{[^}]*currentRoute[^}]*}\s*from\s*['"]@askrjs\/askr['"]/,
  },
  {
    label: 'deprecated foundations registry import',
    pattern:
      /import\s*{[^}]*createCollection[^}]*}\s*from\s*['"]@askrjs\/askr\/foundations['"]/,
  },
  {
    label: 'deprecated foundations layering import',
    pattern:
      /import\s*{[^}]*createLayer[^}]*}\s*from\s*['"]@askrjs\/askr\/foundations['"]/,
  },
  {
    label: 'deprecated root JSXElement import',
    pattern:
      /import\s*{[^}]*\bJSXElement\b[^}]*}\s*from\s*['"]@askrjs\/askr['"]/,
  },
  {
    label: 'stale on() transformer example',
    pattern: /const\s+\w+\s*=\s*on\(\s*eventSource\s*,\s*transformer\s*\);/,
  },
  {
    label: 'stale timer() return-value example',
    pattern: /const\s+\w+\s*=\s*timer\(\s*\d+\s*\);/,
  },
  {
    label: 'broken data reference link',
    pattern: /\[Data API Reference\]\(\.\/data\.md\)/,
  },
  {
    label: 'premature stream() usage example',
    pattern: /const\s+\w+\s*=\s*stream\(/,
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

function collectPublicSpecifiers(contents: string): string[] {
  const specifiers = new Set<string>();
  const specifierPattern = /['"](@askrjs\/askr(?:\/[A-Za-z0-9/_-]+)?)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = specifierPattern.exec(contents)) !== null) {
    specifiers.add(match[1]);
  }

  return [...specifiers];
}

let ensuredDist = false;

function ensureDistAvailable(): void {
  if (ensuredDist && fs.existsSync(path.join(rootDir, 'dist'))) {
    return;
  }

  if (!fs.existsSync(path.join(rootDir, 'dist'))) {
    execFileSync(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', 'build'],
      {
        cwd: rootDir,
        encoding: 'utf8',
      }
    );
  }

  ensuredDist = true;
}

function probeDistExports(): unknown {
  ensureDistAvailable();

  const distDir = path.join(rootDir, 'dist');
  let lastError: unknown;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'askr-dist-'));

    try {
      fs.cpSync(distDir, snapshotDir, { recursive: true, force: true });
      const authPackage = path.join(
        rootDir,
        'node_modules',
        '@askrjs',
        'auth'
      );
      const authSnapshot = path.join(
        snapshotDir,
        'node_modules',
        '@askrjs',
        'auth'
      );
      fs.mkdirSync(path.dirname(authSnapshot), { recursive: true });
      const authSource = fs.realpathSync(authPackage);
      fs.mkdirSync(authSnapshot, { recursive: true });
      fs.copyFileSync(
        path.join(authSource, 'package.json'),
        path.join(authSnapshot, 'package.json')
      );
      fs.cpSync(
        path.join(authSource, 'dist'),
        path.join(authSnapshot, 'dist'),
        { recursive: true }
      );
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
      const testingModuleHref = pathToFileURL(
        path.join(snapshotDir, 'testing', 'index.js')
      ).href;
      const utilitiesModuleHref = pathToFileURL(
        path.join(snapshotDir, 'foundations', 'utilities', 'index.js')
      ).href;
      const interactionsModuleHref = pathToFileURL(
        path.join(snapshotDir, 'foundations', 'interactions', 'index.js')
      ).href;
      const stateModuleHref = pathToFileURL(
        path.join(snapshotDir, 'foundations', 'state', 'index.js')
      ).href;
      const structuresModuleHref = pathToFileURL(
        path.join(snapshotDir, 'foundations', 'structures', 'index.js')
      ).href;
      const iconModuleHref = pathToFileURL(
        path.join(snapshotDir, 'foundations', 'icon', 'index.js')
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
            const testingModule = await import(${JSON.stringify(
              testingModuleHref
            )});
            const utilitiesModule = await import(${JSON.stringify(
              utilitiesModuleHref
            )});
            const interactionsModule = await import(${JSON.stringify(
              interactionsModuleHref
            )});
            const stateModule = await import(${JSON.stringify(stateModuleHref)});
            const structuresModule = await import(${JSON.stringify(
              structuresModuleHref
            )});
            const iconModule = await import(${JSON.stringify(iconModuleHref)});
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
                hasCreateIslands: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'createIslands'
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
                hasLayout: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'layout'
                ),
                hasSlot: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'Slot'
                ),
                hasPresence: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'Presence'
                ),
                hasDefinePortal: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'definePortal'
                ),
                hasDefaultPortal: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'DefaultPortal'
                ),
                hasPortal: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'Portal'
                ),
                hasCreateCollection: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'createCollection'
                ),
                hasCreateLayer: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'createLayer'
                ),
                hasComposeHandlers: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'composeHandlers'
                ),
                hasPressable: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'pressable'
                ),
                hasIsControlled: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'isControlled'
                ),
                hasIconBase: Object.prototype.hasOwnProperty.call(
                  rootModule,
                  'IconBase'
                ),
              },
              router: {
                route: typeof routerModule.route,
                currentRoute: typeof routerModule.currentRoute,
                navigate: typeof routerModule.navigate,
                Link: typeof routerModule.Link,
                group: typeof routerModule.group,
                fallback: typeof routerModule.fallback,
                registerRoutes: typeof routerModule.registerRoutes,
                hasRegisterRoute: Object.prototype.hasOwnProperty.call(
                  routerModule,
                  'registerRoute'
                ),
              },
              resources: {
                resource: typeof resourcesModule.resource,
                getSignal: typeof resourcesModule.getSignal,
                on: typeof resourcesModule.on,
                timer: typeof resourcesModule.timer,
                task: typeof resourcesModule.task,
                stream: typeof resourcesModule.stream,
                capture: typeof resourcesModule.capture,
                hasCreateQuery: Object.prototype.hasOwnProperty.call(
                  resourcesModule,
                  'createQuery'
                ),
                hasCreateMutation: Object.prototype.hasOwnProperty.call(
                  resourcesModule,
                  'createMutation'
                ),
                hasInvalidate: Object.prototype.hasOwnProperty.call(
                  resourcesModule,
                  'invalidate'
                ),
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
                invalidateOnInterval: typeof dataModule.invalidateOnInterval,
              },
              testing: {
                mockQuery: typeof testingModule.mockQuery,
                queryState: typeof testingModule.queryState,
                createInvalidationRecorder:
                  typeof testingModule.createInvalidationRecorder,
              },
              utilities: {
                composeHandlers: typeof utilitiesModule.composeHandlers,
                mergeProps: typeof utilitiesModule.mergeProps,
                ariaDisabled: typeof utilitiesModule.ariaDisabled,
                ariaExpanded: typeof utilitiesModule.ariaExpanded,
                ariaSelected: typeof utilitiesModule.ariaSelected,
                composeRefs: typeof utilitiesModule.composeRefs,
                setRef: typeof utilitiesModule.setRef,
                formatId: typeof utilitiesModule.formatId,
              },
              interactions: {
                pressable: typeof interactionsModule.pressable,
                dismissable: typeof interactionsModule.dismissable,
                focusable: typeof interactionsModule.focusable,
                hoverable: typeof interactionsModule.hoverable,
                rovingFocus: typeof interactionsModule.rovingFocus,
                applyInteractionPolicy:
                  typeof interactionsModule.applyInteractionPolicy,
                mergeInteractionProps:
                  typeof interactionsModule.mergeInteractionProps,
              },
              state: {
                isControlled: typeof stateModule.isControlled,
                resolveControllable:
                  typeof stateModule.resolveControllable,
                makeControllable: typeof stateModule.makeControllable,
                controllableState: typeof stateModule.controllableState,
              },
              structures: {
                layout: typeof structuresModule.layout,
                Slot: typeof structuresModule.Slot,
                definePortal: typeof structuresModule.definePortal,
                DefaultPortal: typeof structuresModule.DefaultPortal,
                Portal: typeof structuresModule.Portal,
                Presence: typeof structuresModule.Presence,
                createCollection: typeof structuresModule.createCollection,
                createLayer: typeof structuresModule.createLayer,
              },
              icon: {
                IconBase: typeof iconModule.IconBase,
                getIconContractProps: typeof iconModule.getIconContractProps,
                isIconSizeToken: typeof iconModule.isIconSizeToken,
                normalizeIconSizeValue:
                  typeof iconModule.normalizeIconSizeValue,
                resolveIconSizeVariable:
                  typeof iconModule.resolveIconSizeVariable,
                resolveIconStrokeWidthVariable:
                  typeof iconModule.resolveIconStrokeWidthVariable,
                serializeIconStyle: typeof iconModule.serializeIconStyle,
                joinIconStyle: typeof iconModule.joinIconStyle,
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
                createIslands: typeof bootModule.createIslands,
                createSPA: typeof bootModule.createSPA,
                hydrateSPA: typeof bootModule.hydrateSPA,
                cleanupApp: typeof bootModule.cleanupApp,
                hasApp: typeof bootModule.hasApp,
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
                Portal: typeof foundationsModule.Portal,
                Presence: typeof foundationsModule.Presence,
                hasCreateCollection: Object.prototype.hasOwnProperty.call(
                  foundationsModule,
                  'createCollection'
                ),
                hasCreateLayer: Object.prototype.hasOwnProperty.call(
                  foundationsModule,
                  'createLayer'
                ),
                hasComposeHandlers: Object.prototype.hasOwnProperty.call(
                  foundationsModule,
                  'composeHandlers'
                ),
                hasPressable: Object.prototype.hasOwnProperty.call(
                  foundationsModule,
                  'pressable'
                ),
                hasIsControlled: Object.prototype.hasOwnProperty.call(
                  foundationsModule,
                  'isControlled'
                ),
                hasIconBase: Object.prototype.hasOwnProperty.call(
                  foundationsModule,
                  'IconBase'
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
  it('should not reference private or non-exported package paths', () => {
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

      const specifiers = collectPublicSpecifiers(contents);
      for (const specifier of specifiers) {
        expect(
          validPublicSpecifiers.has(specifier),
          `unknown public import specifier "${specifier}" in ${path.relative(
            rootDir,
            file
          )}`
        ).toBe(true);
      }
    }
  });

  it('should describe stream as a placeholder public surface', () => {
    const resourcesReference = fs.readFileSync(
      path.join(rootDir, 'docs', 'reference', 'resources.md'),
      'utf8'
    );
    const apiOverview = fs.readFileSync(
      path.join(rootDir, 'docs', 'reference', 'api.md'),
      'utf8'
    );

    expect(resourcesReference).toMatch(/placeholder public surface/i);
    expect(apiOverview).toMatch(/placeholder `stream` surface/i);
  });

  it('should publish representative root and router exports from dist', () => {
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
        hasCreateIslands: false,
        hasCreateSPA: false,
        hasHydrateSPA: false,
        hasCleanupApp: false,
        hasHasApp: false,
        hasRoute: false,
        hasNavigate: false,
        hasResource: false,
        hasCreateQuery: true,
        hasCreateMutation: false,
        hasInvalidate: false,
        hasLink: false,
        hasErrorBoundary: false,
        hasFor: true,
        hasShow: true,
        hasCase: true,
        hasMatch: true,
        hasLayout: false,
        hasSlot: false,
        hasPresence: false,
        hasDefinePortal: false,
        hasDefaultPortal: false,
        hasPortal: false,
        hasCreateCollection: false,
        hasCreateLayer: false,
        hasComposeHandlers: false,
        hasPressable: false,
        hasIsControlled: false,
        hasIconBase: false,
      },
      router: {
        route: 'function',
        currentRoute: 'function',
        navigate: 'function',
        Link: 'function',
        group: 'function',
        fallback: 'function',
        registerRoutes: 'function',
        hasRegisterRoute: false,
      },
      resources: {
        resource: 'function',
        getSignal: 'function',
        on: 'function',
        timer: 'function',
        task: 'function',
        stream: 'function',
        capture: 'function',
        hasCreateQuery: false,
        hasCreateMutation: false,
        hasInvalidate: false,
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
        invalidateOnInterval: 'function',
      },
      testing: {
        mockQuery: 'function',
        queryState: 'object',
        createInvalidationRecorder: 'function',
      },
      utilities: {
        composeHandlers: 'function',
        mergeProps: 'function',
        ariaDisabled: 'function',
        ariaExpanded: 'function',
        ariaSelected: 'function',
        composeRefs: 'function',
        setRef: 'function',
        formatId: 'function',
      },
      interactions: {
        pressable: 'function',
        dismissable: 'function',
        focusable: 'function',
        hoverable: 'function',
        rovingFocus: 'function',
        applyInteractionPolicy: 'function',
        mergeInteractionProps: 'function',
      },
      state: {
        isControlled: 'function',
        resolveControllable: 'function',
        makeControllable: 'function',
        controllableState: 'function',
      },
      structures: {
        layout: 'function',
        Slot: 'function',
        definePortal: 'function',
        DefaultPortal: 'function',
        Portal: 'function',
        Presence: 'function',
        createCollection: 'function',
        createLayer: 'function',
      },
      icon: {
        IconBase: 'function',
        getIconContractProps: 'function',
        isIconSizeToken: 'function',
        normalizeIconSizeValue: 'function',
        resolveIconSizeVariable: 'function',
        resolveIconStrokeWidthVariable: 'function',
        serializeIconStyle: 'function',
        joinIconStyle: 'function',
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
        createIslands: 'function',
        createSPA: 'function',
        hydrateSPA: 'function',
        cleanupApp: 'function',
        hasApp: 'function',
        hasTeardownApp: false,
      },
      foundations: {
        layout: 'function',
        Slot: 'function',
        definePortal: 'function',
        DefaultPortal: 'function',
        Portal: 'function',
        Presence: 'function',
        hasCreateCollection: false,
        hasCreateLayer: false,
        hasComposeHandlers: false,
        hasPressable: false,
        hasIsControlled: false,
        hasIconBase: false,
      },
    });
  }, 30000);
});
// @askr-allow-real-timers -- compiled documentation snippet fixture.
