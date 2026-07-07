import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vite-plus/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');
const srcDir = path.join(rootDir, 'src');

type SourceFile = {
  filePath: string;
  relativePath: string;
  source: ts.SourceFile;
  text: string;
};

type ImportEdge = {
  from: string;
  to: string;
  specifier: string;
  typeOnly: boolean;
};

const TYPESCRIPT_SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'] as const;

const ARCHITECTURE_DRIFT_LINE_LIMIT = 850;
const ARCHITECTURE_AREAS = new Set([
  'boot',
  'common',
  'data',
  'renderer',
  'router',
  'runtime',
  'ssg',
  'ssr',
]);

const NO_MTS_SCAN_PATHS = [
  'src',
  'tests',
  'docs',
  'benches',
  'examples',
  'test-utils',
  'types',
  'scripts',
  'tooling',
];

function isGovernedTypeScriptSourceFile(fileName: string): boolean {
  return (
    TYPESCRIPT_SOURCE_EXTENSIONS.some((extension) =>
      fileName.endsWith(extension)
    ) && !/\.d\.(?:ts|mts|cts)$/.test(fileName)
  );
}

function getSourceScriptKind(fileName: string): ts.ScriptKind {
  return fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function collectSourceFiles(dir: string): SourceFile[] {
  const result: SourceFile[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectSourceFiles(filePath));
      continue;
    }

    if (!isGovernedTypeScriptSourceFile(entry.name)) {
      continue;
    }

    const text = fs.readFileSync(filePath, 'utf8');
    result.push({
      filePath,
      relativePath: path.relative(rootDir, filePath).replaceAll(path.sep, '/'),
      source: ts.createSourceFile(
        filePath,
        text,
        ts.ScriptTarget.Latest,
        true,
        getSourceScriptKind(entry.name)
      ),
      text,
    });
  }

  return result;
}

function collectFilesWithExtension(dir: string, extension: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const result: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectFilesWithExtension(filePath, extension));
      continue;
    }

    if (entry.name.endsWith(extension)) {
      result.push(filePath);
    }
  }

  return result;
}

const sourceFiles = collectSourceFiles(srcDir);
const sourcePathSet = new Set(sourceFiles.map((file) => file.filePath));

function topLevelArea(filePath: string): string {
  const relativePath = path
    .relative(srcDir, filePath)
    .replaceAll(path.sep, '/');
  return relativePath.split('/')[0] ?? '';
}

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

function resolveRelativeImport(
  fromFile: string,
  specifier: string
): string | null {
  if (!isRelativeSpecifier(specifier)) {
    return null;
  }

  const basePath = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    basePath,
    ...TYPESCRIPT_SOURCE_EXTENSIONS.map(
      (extension) => `${basePath}${extension}`
    ),
    ...TYPESCRIPT_SOURCE_EXTENSIONS.map((extension) =>
      path.join(basePath, `index${extension}`)
    ),
  ];

  for (const candidate of candidates) {
    if (sourcePathSet.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

function importClauseIsTypeOnly(
  importClause: ts.ImportClause | undefined
): boolean {
  if (!importClause) {
    return false;
  }

  if (importClause.isTypeOnly) {
    return true;
  }

  if (importClause.name) {
    return false;
  }

  const namedBindings = importClause.namedBindings;
  if (!namedBindings || ts.isNamespaceImport(namedBindings)) {
    return false;
  }

  return namedBindings.elements.every((element) => element.isTypeOnly);
}

function collectImportEdges(files: readonly SourceFile[]): ImportEdge[] {
  const edges: ImportEdge[] = [];

  for (const file of files) {
    for (const statement of file.source.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        const specifier = statement.moduleSpecifier.text;
        const target = resolveRelativeImport(file.filePath, specifier);
        if (!target) {
          continue;
        }

        edges.push({
          from: file.filePath,
          to: target,
          specifier,
          typeOnly: importClauseIsTypeOnly(statement.importClause),
        });
        continue;
      }

      if (
        ts.isExportDeclaration(statement) &&
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        const specifier = statement.moduleSpecifier.text;
        const target = resolveRelativeImport(file.filePath, specifier);
        if (!target) {
          continue;
        }

        edges.push({
          from: file.filePath,
          to: target,
          specifier,
          typeOnly: statement.isTypeOnly,
        });
      }
    }
  }

  return edges;
}

function relative(filePath: string): string {
  return path.relative(rootDir, filePath).replaceAll(path.sep, '/');
}

function formatEdge(edge: ImportEdge): string {
  return `${relative(edge.from)} -> ${relative(edge.to)} (${edge.specifier})`;
}

function findAreaCycles(edges: readonly ImportEdge[]): string[] {
  const graph = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (edge.typeOnly) {
      continue;
    }

    const from = topLevelArea(edge.from);
    const to = topLevelArea(edge.to);
    if (
      !from ||
      !to ||
      from === to ||
      !ARCHITECTURE_AREAS.has(from) ||
      !ARCHITECTURE_AREAS.has(to)
    ) {
      continue;
    }

    let targets = graph.get(from);
    if (!targets) {
      targets = new Set();
      graph.set(from, targets);
    }
    targets.add(to);
  }

  const cycles = new Set<string>();
  const nodes = [...graph.keys()].sort();

  function visit(
    start: string,
    current: string,
    pathStack: string[],
    seen: Set<string>
  ): void {
    const targets = graph.get(current);
    if (!targets) {
      return;
    }

    for (const target of targets) {
      if (target === start) {
        cycles.add([...pathStack, start].join(' -> '));
        continue;
      }
      if (seen.has(target) || target < start) {
        continue;
      }

      seen.add(target);
      visit(start, target, [...pathStack, target], seen);
      seen.delete(target);
    }
  }

  for (const node of nodes) {
    visit(node, node, [node], new Set([node]));
  }

  return [...cycles].sort();
}

const edges = collectImportEdges(sourceFiles);

const BOOT_SPLIT_MODULES = new Map<string, number>([
  ['src/boot/hydration.ts', 360],
  ['src/boot/index.ts', 520],
  ['src/boot/root-lifecycle.ts', 360],
  ['src/boot/route-startup.ts', 160],
  ['src/boot/types.ts', 120],
]);

const DATA_SPLIT_MODULES = new Map<string, number>([
  ['src/data/data-runtime.ts', 260],
  ['src/data/index.ts', 260],
  ['src/data/invalidation.ts', 180],
  ['src/data/mutation-cell.ts', 320],
  ['src/data/query-cell.ts', 560],
  ['src/data/query-key.ts', 120],
  ['src/data/shared.ts', 80],
  ['src/data/types.ts', 220],
]);

const ROUTER_SPLIT_MODULES = new Map<string, number>([
  ['src/router/access.ts', 220],
  ['src/router/activity.ts', 260],
  ['src/router/authoring.ts', 700],
  ['src/router/lazy.ts', 180],
  ['src/router/manifest.ts', 180],
  ['src/router/navigate.ts', 620],
  ['src/router/navigation-registry.ts', 320],
  ['src/router/navigation-scroll.ts', 240],
  ['src/router/navigation-targets.ts', 500],
  ['src/router/rendering.ts', 180],
  ['src/router/resolution.ts', 700],
  ['src/router/route-query.ts', 180],
  ['src/router/store.ts', 420],
]);

const RENDERER_RECONCILE_MODULES = new Map<string, number>([
  ['src/renderer/keyed-children.ts', 120],
  ['src/renderer/keyed.ts', 360],
  ['src/renderer/namespaces.ts', 90],
  ['src/renderer/reconcile.ts', 620],
  ['src/renderer/reconcile-commit.ts', 120],
  ['src/renderer/reconcile-fastpaths.ts', 320],
  ['src/renderer/reconcile-resolution.ts', 420],
]);

const RENDERER_DOM_FACADE_MODULES = new Map<string, number>([
  ['src/renderer/dom.ts', 20],
]);

const RENDERER_DOM_HELPER_MODULES = new Map<string, number>([
  ['src/renderer/attributes.ts', 520],
  ['src/renderer/boundaries.ts', 760],
  ['src/renderer/child-shape.ts', 180],
  ['src/renderer/component-host.ts', 620],
  ['src/renderer/component-host-cleanup.ts', 180],
  ['src/renderer/component-host-instances.ts', 180],
  ['src/renderer/dom-internal.ts', 850],
  ['src/renderer/element-children.ts', 460],
  ['src/renderer/error-boundary-dom.ts', 180],
  ['src/renderer/prop-bindings.ts', 580],
  ['src/renderer/reactive-child-dom.ts', 260],
  ['src/renderer/reactive-child-sources.ts', 430],
  ['src/renderer/reactive-children.ts', 660],
  ['src/renderer/stable-patch.ts', 280],
  ['src/renderer/static-reuse.ts', 220],
]);

const RENDERER_FOR_COMMIT_MODULES = new Map<string, number>([
  ['src/renderer/for-commit.ts', 620],
  ['src/renderer/for-commit-dom-map.ts', 220],
  ['src/renderer/for-commit-removal.ts', 80],
  ['src/renderer/for-commit-reorder.ts', 220],
]);

const RENDERER_EVALUATE_MODULES = new Map<string, number>([
  ['src/renderer/evaluate.ts', 620],
  ['src/renderer/evaluate-dom-range.ts', 220],
  ['src/renderer/evaluate-reconcile.ts', 520],
]);

const RUNTIME_COMPONENT_FACADE_MODULES = new Map<string, number>([
  ['src/runtime/component-facade.ts', 60],
  ['src/runtime/component.ts', 20],
]);

const RUNTIME_COMPONENT_HELPER_MODULES = new Map<string, number>([
  ['src/runtime/component-cleanup.ts', 180],
  ['src/runtime/component-commit.ts', 430],
  ['src/runtime/component-lifecycle.ts', 430],
  ['src/runtime/component-scope.ts', 360],
]);

const RUNTIME_FOR_FACADE_MODULES = new Map<string, number>([
  ['src/runtime/for.ts', 20],
]);

const RUNTIME_FOR_HELPER_MODULES = new Map<string, number>([
  ['src/runtime/for-reconcile.ts', 660],
  ['src/runtime/for-scopes.ts', 430],
  ['src/runtime/for-signals.ts', 300],
]);

const RUNTIME_OPERATIONS_MODULES = new Map<string, number>([
  ['src/runtime/lifecycle-operations.ts', 420],
  ['src/runtime/operations.ts', 30],
  ['src/runtime/resource-operation.ts', 320],
]);

const SSR_FACADE_MODULES = new Map<string, number>([['src/ssr/index.ts', 20]]);

const SSR_ROUTE_RENDER_MODULES = new Map<string, number>([
  ['src/ssr/route-render.ts', 360],
]);

const SSR_COMPONENT_RUNTIME_MODULES = new Map<string, number>([
  ['src/ssr/component-runtime.ts', 240],
]);

const SSR_BOUNDARY_MODULES = new Map<string, number>([
  ['src/ssr/boundaries.ts', 240],
]);

const RUNTIME_COMPONENT_OWNER_MODULES = new Map<string, number>([
  ['src/runtime/component-internal.ts', 500],
]);

const RUNTIME_FOR_OWNER_MODULES = new Map<string, number>([
  ['src/runtime/for-internal.ts', 320],
]);

const SSR_INTERNAL_MODULES = new Map<string, number>([
  ['src/ssr/hydration-data.ts', 120],
  ['src/ssr/hydration-verify.ts', 360],
  ['src/ssr/index-internal.ts', 350],
  ['src/ssr/render-sync.ts', 520],
]);

const SSG_ORCHESTRATION_MODULES = new Map<string, number>([
  ['src/ssg/create-static-gen.ts', 460],
  ['src/ssg/generation-plan.ts', 140],
  ['src/ssg/static-routes.ts', 240],
]);

const SINGLETON_IMPORT_ALLOWLIST = new Set([
  'src/runtime/access.ts',
  'src/runtime/runtime.ts',
]);

const RUNTIME_SCHEDULER_VALUE_IMPORT_ALLOWLIST = new Set([
  'src/fx/index.ts',
  'src/runtime/access.ts',
  'src/runtime/index.ts',
  'src/runtime/runtime.ts',
]);

function collectNamedImports(
  file: SourceFile
): Array<{ name: string; target: string }> {
  const imports: Array<{ name: string; target: string }> = [];

  for (const statement of file.source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }

    const target = resolveRelativeImport(
      file.filePath,
      statement.moduleSpecifier.text
    );
    if (!target || importClauseIsTypeOnly(statement.importClause)) {
      continue;
    }

    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || ts.isNamespaceImport(namedBindings)) {
      continue;
    }

    for (const element of namedBindings.elements) {
      if (element.isTypeOnly) {
        continue;
      }
      imports.push({
        name: element.propertyName?.text ?? element.name.text,
        target: relative(target),
      });
    }
  }

  return imports;
}

describe('architecture boundaries', () => {
  it('should reject .mts files in governed source, docs, and test paths', () => {
    const offenders = NO_MTS_SCAN_PATHS.flatMap((scanPath) =>
      collectFilesWithExtension(path.join(rootDir, scanPath), '.mts')
    )
      .map((filePath) =>
        path.relative(rootDir, filePath).replaceAll(path.sep, '/')
      )
      .sort();

    expect(offenders).toEqual([]);
  });

  it('should keep runtime independent from concrete platform subsystems', () => {
    const forbidden = edges
      .filter((edge) => !edge.typeOnly && topLevelArea(edge.from) === 'runtime')
      .filter((edge) => {
        const targetArea = topLevelArea(edge.to);
        if (['renderer', 'boot', 'ssr', 'ssg'].includes(targetArea)) {
          return true;
        }

        return relative(edge.to) === 'src/router/navigate.ts';
      })
      .map(formatEdge);

    expect(forbidden).toEqual([]);
  });

  it('should keep renderer on narrow runtime contracts instead of component internals', () => {
    const forbidden = edges
      .filter((edge) => topLevelArea(edge.from) === 'renderer')
      .filter((edge) => relative(edge.to) === 'src/runtime/component.ts')
      .map(formatEdge);

    expect(forbidden).toEqual([]);
  });

  it('should keep external runtime consumers on the runtime facade', () => {
    const runtimeFacade = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/index.ts'
    );

    expect(runtimeFacade).toBeDefined();
    expect(runtimeFacade!.text.split(/\r?\n/).length).toBeLessThanOrEqual(120);

    const forbidden = edges
      .filter((edge) => !edge.typeOnly)
      .filter((edge) => topLevelArea(edge.from) !== 'runtime')
      .filter(
        (edge) =>
          relative(edge.to).startsWith('src/runtime/') &&
          relative(edge.to) !== 'src/runtime/index.ts'
      )
      .map(formatEdge)
      .sort();

    expect(forbidden).toEqual([]);
  });

  it('should keep shared infrastructure out of src/dev', () => {
    const offenders = sourceFiles
      .filter((file) => file.relativePath.startsWith('src/dev/'))
      .map((file) => file.relativePath)
      .sort();

    expect(offenders).toEqual([]);
  });

  it('should keep subsystem value imports acyclic', () => {
    expect(findAreaCycles(edges)).toEqual([]);
  });

  it('should keep hidden singleton bridge globals out of runtime code', () => {
    const forbiddenNames = [
      '__ASKR_RENDERER',
      '__ASKR_FASTLANE',
      '__ASKR_HAS_ROUTES__',
    ];

    const offenders = sourceFiles
      .flatMap((file) =>
        forbiddenNames
          .filter((name) => file.text.includes(name))
          .map((name) => `${file.relativePath}: ${name}`)
      )
      .sort();

    expect(offenders).toEqual([]);
  });

  it('should keep default runtime singletons behind the runtime access boundary', () => {
    const forbidden = sourceFiles
      .filter((file) => !SINGLETON_IMPORT_ALLOWLIST.has(file.relativePath))
      .flatMap((file) =>
        collectNamedImports(file)
          .filter(
            (imported) =>
              (imported.name === 'globalScheduler' &&
                imported.target === 'src/runtime/scheduler.ts') ||
              (imported.name === 'getDefaultRuntime' &&
                imported.target === 'src/runtime/runtime.ts')
          )
          .map(
            (imported) =>
              `${file.relativePath}: ${imported.name} from ${imported.target}`
          )
      )
      .sort();

    expect(forbidden).toEqual([]);
  });

  it('should keep scheduler value access behind runtime access or compatibility exports', () => {
    const forbidden = edges
      .filter((edge) => !edge.typeOnly)
      .filter((edge) => relative(edge.to) === 'src/runtime/scheduler.ts')
      .filter(
        (edge) =>
          !RUNTIME_SCHEDULER_VALUE_IMPORT_ALLOWLIST.has(relative(edge.from))
      )
      .map(formatEdge)
      .sort();

    expect(forbidden).toEqual([]);
  });

  it('should keep boot hydration and config types split out of the entrypoint', () => {
    const boot = sourceFiles.find(
      (file) => file.relativePath === 'src/boot/index.ts'
    );
    const rootLifecycle = sourceFiles.find(
      (file) => file.relativePath === 'src/boot/root-lifecycle.ts'
    );
    const routeStartup = sourceFiles.find(
      (file) => file.relativePath === 'src/boot/route-startup.ts'
    );

    expect(boot).toBeDefined();
    expect(rootLifecycle).toBeDefined();
    expect(routeStartup).toBeDefined();
    expect(boot!.text).not.toMatch(
      /function\s+(takeHydrationRenderData|markSkippedElements|collectDeferredBelowFoldBoundaries|applySelectiveHydration|mountOrUpdate|cleanupRootInstance|resolveInitialRoute)|const\s+(instancesByRoot|MAX_INITIAL_ROUTE_REDIRECTS)\s*=|type\s+BootRouteSource|export\s+type\s+(SPAConfig|HydrateSPAConfig|IslandConfig)/
    );

    const bootImports = edges
      .filter((edge) => edge.from === boot!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(bootImports).toContain('src/boot/root-lifecycle.ts');
    expect(bootImports).toContain('src/boot/route-startup.ts');

    for (const [filePath, maxLines] of BOOT_SPLIT_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep data contracts and query key serialization split out of the data runtime', () => {
    const data = sourceFiles.find(
      (file) => file.relativePath === 'src/data/index.ts'
    );
    const dataRuntime = sourceFiles.find(
      (file) => file.relativePath === 'src/data/data-runtime.ts'
    );
    const queryCell = sourceFiles.find(
      (file) => file.relativePath === 'src/data/query-cell.ts'
    );
    const mutationCell = sourceFiles.find(
      (file) => file.relativePath === 'src/data/mutation-cell.ts'
    );
    const invalidation = sourceFiles.find(
      (file) => file.relativePath === 'src/data/invalidation.ts'
    );

    expect(data).toBeDefined();
    expect(dataRuntime).toBeDefined();
    expect(queryCell).toBeDefined();
    expect(mutationCell).toBeDefined();
    expect(invalidation).toBeDefined();
    expect(data!.text).not.toMatch(
      /function\s+(serializeQueryKeyPart|serializeQueryKeyNumber|createReadableSource|notifySource|isAbortError|normalizeAsyncDataError|getActiveDataRuntime|ensureQueryCleanup|invalidateQueriesForRuntime|invalidateOnInterval)|class\s+(QueryCell|MutationCell)|type\s+(QueryLoading|QueryFresh|QueryRefreshing|QueryPendingWrite|QueryStaleValue|QueryStaleErrorWithValue|QueryStaleError|MutationIdle|MutationPending|MutationSuccess|MutationError|QuerySlot|DataRuntimeState)|interface\s+(DataRuntime|DataRuntimeOptions|InvalidateOptions|QueryScope)/
    );

    const facadeImports = edges
      .filter((edge) => edge.from === data!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(facadeImports).toContain('src/data/data-runtime.ts');
    expect(facadeImports).toContain('src/data/query-cell.ts');
    expect(facadeImports).toContain('src/data/mutation-cell.ts');
    expect(facadeImports).toContain('src/data/invalidation.ts');
    expect(queryCell!.text).not.toMatch(
      /export\s+function\s+invalidate|export\s+function\s+invalidateOnInterval|class\s+MutationCell/
    );
    expect(mutationCell!.text).not.toMatch(/class\s+QueryCell/);
    expect(invalidation!.text).not.toMatch(/class\s+(QueryCell|MutationCell)/);

    for (const [filePath, maxLines] of DATA_SPLIT_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep router state and resolution split out of the route facade', () => {
    const facade = sourceFiles.find(
      (file) => file.relativePath === 'src/router/route.ts'
    );

    expect(facade).toBeDefined();
    expect(facade!.text.split(/\r?\n/).length).toBeLessThanOrEqual(160);
    expect(facade!.text).not.toMatch(
      /currentRouteSnapshot|registerRouteAtResolvedPath|resolveRouteRequest\s*\(|const routes\s*=/
    );

    const navigate = sourceFiles.find(
      (file) => file.relativePath === 'src/router/navigate.ts'
    );
    const routeQuery = sourceFiles.find(
      (file) => file.relativePath === 'src/router/route-query.ts'
    );
    const registry = sourceFiles.find(
      (file) => file.relativePath === 'src/router/navigation-registry.ts'
    );
    const targets = sourceFiles.find(
      (file) => file.relativePath === 'src/router/navigation-targets.ts'
    );
    expect(navigate).toBeDefined();
    expect(routeQuery).toBeDefined();
    expect(registry).toBeDefined();
    expect(targets).toBeDefined();
    expect(navigate!.text).not.toMatch(
      /scrollPositions|scrollRestorationOptions|function readScrollPosition|function\s+(setRouteQueryValue|applyRouteQueryUpdates|resolveNavigationTargetsForApps|applyNavigationTargets|resolveAppRouteRequest|remountResolvedRoute|rerenderResolvedRoute|syncRegisteredRouteSnapshot|syncAppRegistrationLocation|cleanupRouteOwnership)|const\s+registeredApps\s*=|activeRouteRequestController/
    );

    const navigateImports = edges
      .filter((edge) => edge.from === navigate!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(navigateImports).toContain('src/router/route-query.ts');
    expect(navigateImports).toContain('src/router/navigation-registry.ts');
    expect(navigateImports).toContain('src/router/navigation-targets.ts');
    expect(routeQuery!.text).not.toMatch(/from\s+['"]\.\/navigate['"]/);
    expect(registry!.text).not.toMatch(/from\s+['"]\.\/navigate['"]/);
    expect(targets!.text).not.toMatch(/from\s+['"]\.\/navigate['"]/);

    for (const [filePath, maxLines] of ROUTER_SPLIT_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep route matching split out of policy continuation resolution', () => {
    const resolution = sourceFiles.find(
      (file) => file.relativePath === 'src/router/resolution.ts'
    );
    const routeMatching = sourceFiles.find(
      (file) => file.relativePath === 'src/router/route-matching.ts'
    );

    expect(resolution).toBeDefined();
    expect(routeMatching).toBeDefined();
    expect(resolution!.text).not.toMatch(
      /const\s+(routeSegsCache|routeRankCache|sortedListCache)\s*=|function\s+(cachedSegs|cachedRank|cachedSortedList|matchFallbackPrefix|findBestResolvedRouteFromRoutes|findBestScopedFallbackRecord|getMatchingRecord|computeMatchesFromRoutes|computeMatchesFromRouteRecords|computeRouteActivityMatches|resolveRouteFromRoutes|_resolveRouteMatchFromRoutes|resolveRoute)\s*\(/
    );

    const resolutionImports = edges
      .filter((edge) => edge.from === resolution!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(resolutionImports).toContain('src/router/route-matching.ts');
  });

  it('should keep testing helpers on router and data owned facades', () => {
    const testing = sourceFiles.find(
      (file) => file.relativePath === 'src/testing/index.ts'
    );
    const routerTesting = sourceFiles.find(
      (file) => file.relativePath === 'src/router/testing.ts'
    );
    const dataTesting = sourceFiles.find(
      (file) => file.relativePath === 'src/data/testing.ts'
    );

    expect(testing).toBeDefined();
    expect(routerTesting).toBeDefined();
    expect(dataTesting).toBeDefined();
    expect(testing!.text).not.toMatch(
      /from\s+['"]\.\.\/router\/match['"]|from\s+['"]\.\.\/data\/invalidation-listeners['"]/
    );

    const testingImports = edges
      .filter((edge) => edge.from === testing!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(testingImports).toContain('src/router/testing.ts');
    expect(testingImports).toContain('src/data/testing.ts');
  });

  it('should keep keyed child snapshots split out of the reconcile orchestrator', () => {
    const reconcile = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/reconcile.ts'
    );
    const fastpaths = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/reconcile-fastpaths.ts'
    );
    const resolution = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/reconcile-resolution.ts'
    );
    const commit = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/reconcile-commit.ts'
    );

    expect(reconcile).toBeDefined();
    expect(fastpaths).toBeDefined();
    expect(resolution).toBeDefined();
    expect(commit).toBeDefined();
    expect(reconcile!.text).not.toMatch(
      /function\s+(buildDOMKeyMap|extractKeyedVnodes|getParentNamespace|resolveChildNamespace|tryFastPaths|tryRendererFastPath|tryForcedPositionalBulkUpdate|tryPositionalBulkUpdate|countPositionalMatches|hasPositionalPropChanges|prepareControlBoundaryResolution|evaluateControlBoundaryChildren|trySyncComponentChild|canReuseElement|collectUnkeyedElements|tryReuseElement|commitReconciliation)|interface\s+KeyedVnode/
    );

    const reconcileImports = edges
      .filter((edge) => edge.from === reconcile!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(reconcileImports).toContain('src/renderer/reconcile-fastpaths.ts');
    expect(reconcileImports).toContain('src/renderer/reconcile-resolution.ts');
    expect(reconcileImports).toContain('src/renderer/reconcile-commit.ts');
    expect(fastpaths!.text).not.toMatch(/from\s+['"]\.\/dom['"]/);
    expect(resolution!.text).not.toMatch(/from\s+['"]\.\/dom['"]/);
    expect(commit!.text).not.toMatch(/from\s+['"]\.\/dom['"]/);

    for (const [filePath, maxLines] of RENDERER_RECONCILE_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep the DOM renderer facade free of implementation logic', () => {
    const facade = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/dom.ts'
    );

    expect(facade).toBeDefined();
    expect(facade!.text).not.toMatch(
      /function\s+(createDOMNode|updateElementFromVnode|updateElementChildren|syncComponentElement|createForBoundary|commitForBoundaryChildren|tryPatchStableForDirtyItem|setStaticChildSlotsCacheEnabled)/
    );

    for (const [filePath, maxLines] of RENDERER_DOM_FACADE_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep renderer attribute and control-boundary helpers wired into the active DOM path', () => {
    const domInternal = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/dom-internal.ts'
    );
    const boundaries = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/boundaries.ts'
    );
    const componentHost = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/component-host.ts'
    );

    expect(domInternal).toBeDefined();
    expect(boundaries).toBeDefined();
    expect(componentHost).toBeDefined();

    const helperImports = edges
      .filter((edge) => edge.from === domInternal!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));
    const componentHostImports = edges
      .filter((edge) => edge.from === componentHost!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(helperImports).toContain('src/renderer/attributes.ts');
    expect(helperImports).toContain('src/renderer/boundaries.ts');
    expect(helperImports).toContain('src/renderer/component-host.ts');
    expect(helperImports).toContain('src/renderer/element-children.ts');
    expect(helperImports).toContain('src/renderer/error-boundary-dom.ts');
    expect(helperImports).toContain('src/renderer/stable-patch.ts');

    expect(domInternal!.text).not.toMatch(
      /function\s+(applyFormControlProp|applyStaticScalarPropsToElement|applyClassPropValue|applyStylePropValue|removeStaleAttributes|materializeKey|hasMatchingStaticProps|evaluateControlBoundaryState|getDirectControlBoundaryVNode|registerControlBoundaryCommitOwner|commitForBoundaryChildren|syncForItemDom|trySyncControlBoundaryChild|cleanupDetachedComponentHost|pruneComponentHostInstances|inheritComponentKey|findHostInstanceByType|materializeComponentResultNode|resolveNestedComponentResult|resolveHostNestedComponentResult|resolveWrapperHostResult|syncComponentElement|createComponentElement|createErrorBoundaryElement|normalizeStableIntrinsicChildren|getStableIntrinsicChildren|patchStableIntrinsicText|patchStableIntrinsicElement|resolveStableIntrinsicPatchVNode|tryPatchStableForDirtyItem|updateElementChildren|hasKeyedVNodeChildren|isEmptyChild|getOrBuildDomKeyMap|updateUnkeyedChildren)\s*\(/
    );
    expect(domInternal!.text).not.toMatch(
      /const\s+controlBoundaryOwners\s*=|type\s+ControlBoundaryCommitOwnerState\s*=|const\s+vnodeComponentInstances\s*=|type\s+InstanceHostElement\s*=|type\s+ErrorBoundaryVNode\s*=/
    );
    expect(componentHostImports).toContain(
      'src/renderer/component-host-instances.ts'
    );
    expect(componentHost!.text).not.toMatch(
      /function\s+(isRouteRootComponentVNode|inheritComponentCleanupStrict|getVNodeComponentInstance|setVNodeComponentInstance|nextComponentInstanceId|inheritComponentKey|findHostInstanceByType)\s*\(|const\s+vnodeComponentInstances\s*=|let\s+fallbackComponentInstanceId\s*=/
    );
    expect(boundaries!.text).not.toMatch(/from\s+['"]\.\/dom['"]/);

    for (const [filePath, maxLines] of RENDERER_DOM_HELPER_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep renderer static subtree reuse split out of the active DOM path', () => {
    const domInternal = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/dom-internal.ts'
    );
    const staticReuse = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/static-reuse.ts'
    );

    expect(domInternal).toBeDefined();
    expect(staticReuse).toBeDefined();

    const helperImports = edges
      .filter((edge) => edge.from === domInternal!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(helperImports).toContain('src/renderer/static-reuse.ts');
    expect(domInternal!.text).not.toMatch(
      /function\s+(upperCommonTagName|tagsEqualIgnoreCase|collectStaticChildSlots|getStaticChildSlots|canReuseStaticSubtree)\s*\(/
    );
    expect(domInternal!.text).not.toMatch(
      /type\s+StaticChildSlot\s*=|interface\s+StaticChildSlotsCacheNode|STATIC_CHILD_SLOTS_CACHE|staticChildSlotsCacheEnabled/
    );
    expect(staticReuse!.text).not.toMatch(/from\s+['"]\.\/dom['"]/);
  });

  it('should keep positional keyed child fast paths split out of bulk child replacement', () => {
    const children = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/children.ts'
    );
    const fastpath = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/children-fastpath.ts'
    );

    expect(children).toBeDefined();
    expect(fastpath).toBeDefined();
    expect(children!.text).not.toMatch(
      /function\s+(upperCommonTagName|updateTextContent|tryUpdateTwoChildTextPattern|setTextNodeData|setDataKey|replaceNodeAtPosition|updateKeyedElementsMap)\s*\(|export\s+function\s+performBulkPositionalKeyedTextUpdate\s*\(/
    );

    const childImports = edges
      .filter((edge) => edge.from === children!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(childImports).toContain('src/renderer/children-fastpath.ts');
  });

  it('should keep DOM error boundary handling off the public components surface', () => {
    const componentBoundary = sourceFiles.find(
      (file) => file.relativePath === 'src/components/error-boundary.tsx'
    );
    const rendererBoundary = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/error-boundary-dom.ts'
    );

    expect(componentBoundary).toBeDefined();
    expect(rendererBoundary).toBeDefined();
    expect(componentBoundary!.text).not.toMatch(
      /export\s+function\s+(resolveErrorBoundaryFallback|createBoundaryReset|reportBoundaryError)\s*\(/
    );
    expect(rendererBoundary!.text).not.toMatch(
      /from\s+['"]\.\.\/components\/error-boundary['"]/
    );
  });

  it('should keep For DOM commit maps and reorders split out of commit orchestration', () => {
    const forCommit = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/for-commit.ts'
    );
    const domMap = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/for-commit-dom-map.ts'
    );
    const reorder = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/for-commit-reorder.ts'
    );
    const removal = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/for-commit-removal.ts'
    );

    expect(forCommit).toBeDefined();
    expect(domMap).toBeDefined();
    expect(reorder).toBeDefined();
    expect(removal).toBeDefined();
    expect(forCommit!.text).not.toMatch(
      /function\s+(getOrBuildDomKeyMap|syncKeyedMapFromForState|hydrateExistingForDomInOrder|getLISIndices|commitMoveOnlyReorder|removeForBoundaryNodes)\s*\(/
    );

    const helperImports = edges
      .filter((edge) => edge.from === forCommit!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(helperImports).toContain('src/renderer/for-commit-dom-map.ts');
    expect(helperImports).toContain('src/renderer/for-commit-removal.ts');
    expect(helperImports).toContain('src/renderer/for-commit-reorder.ts');
    expect(domMap!.text).not.toMatch(/from\s+['"]\.\/dom['"]/);
    expect(removal!.text).not.toMatch(/from\s+['"]\.\/dom['"]/);
    expect(reorder!.text).not.toMatch(/from\s+['"]\.\/dom['"]/);

    for (const [filePath, maxLines] of RENDERER_FOR_COMMIT_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep evaluate range and reconciliation helpers split out of evaluator orchestration', () => {
    const evaluate = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/evaluate.ts'
    );
    const range = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/evaluate-dom-range.ts'
    );
    const reconcile = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/evaluate-reconcile.ts'
    );

    expect(evaluate).toBeDefined();
    expect(range).toBeDefined();
    expect(reconcile).toBeDefined();
    expect(evaluate!.text).not.toMatch(
      /function\s+(getRetainedHostOwnerChain|retainHostOwnerChain|tagNamesEqualIgnoreCase|checkSimpleText|tryUpdateTextInPlace|buildKeyMapFromDOM|getOrBuildKeyMap|hasKeyedChildren|trackBulkTextStats|trackBulkTextMiss|reconcileKeyed|tryForcedBulkKeyedPath|reconcileUnkeyed|updateForBoundaryChildren|updateElementChildren|smartUpdateElement|processFragmentChildren|cleanupRangeNode|updateDOMRange)\s*\(/
    );
    expect(evaluate!.text).not.toMatch(
      /interface\s+(DOMRange|SimpleTextResult|NotSimpleTextResult)|const\s+domRanges\s*=|type\s+TextCheckResult\s*=/
    );

    const helperImports = edges
      .filter((edge) => edge.from === evaluate!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(helperImports).toContain('src/renderer/evaluate-dom-range.ts');
    expect(helperImports).toContain('src/renderer/evaluate-reconcile.ts');
    expect(range!.text).not.toMatch(/from\s+['"]\.\/dom['"]/);
    expect(reconcile!.text).not.toMatch(/from\s+['"]\.\/dom['"]/);

    for (const [filePath, maxLines] of RENDERER_EVALUATE_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep renderer namespace helpers split out of DOM creation paths', () => {
    const namespaces = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/namespaces.ts'
    );
    const namespaceUsers = [
      'src/renderer/dom-internal.ts',
      'src/renderer/evaluate-reconcile.ts',
      'src/renderer/boundaries.ts',
    ].map((filePath) => {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      return file!;
    });

    expect(namespaces).toBeDefined();

    for (const file of namespaceUsers) {
      const helperImports = edges
        .filter((edge) => edge.from === file.filePath && !edge.typeOnly)
        .map((edge) => relative(edge.to));

      expect(helperImports).toContain('src/renderer/namespaces.ts');
      expect(file.text).not.toMatch(
        /const\s+SVG_NAMESPACE\s*=|function\s+(resolveChildNamespace|createElementForNamespace)\s*\(|createElementNS\s*\(/
      );
    }

    expect(namespaces!.text).not.toMatch(/from\s+['"]\.\/dom['"]/);
  });

  it('should keep renderer prop bindings split out of the active DOM path', () => {
    const domInternal = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/dom-internal.ts'
    );
    const propBindings = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/prop-bindings.ts'
    );

    expect(domInternal).toBeDefined();
    expect(propBindings).toBeDefined();

    const helperImports = edges
      .filter((edge) => edge.from === domInternal!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(helperImports).toContain('src/renderer/prop-bindings.ts');
    expect(domInternal!.text).not.toMatch(
      /function\s+(addTrackedListener|setupReactiveProp|applyPropsToElement|syncElementPropBindings|hasTrackedElementPropBindings)\s*\(/
    );
    expect(domInternal!.text).not.toMatch(
      /interface\s+ReactivePropDescriptor|reactivePropRegistry|export\s+function\s+markReactivePropsDirtySource/
    );
    expect(domInternal!.text).not.toMatch(
      /from\s+['"]\.\.\/runtime\/events['"]/
    );
    expect(propBindings!.text).not.toMatch(/from\s+['"]\.\/dom['"]/);
  });

  it('should keep renderer child shape helpers split out of the active DOM path', () => {
    const domInternal = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/dom-internal.ts'
    );
    const childShape = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/child-shape.ts'
    );

    expect(domInternal).toBeDefined();
    expect(childShape).toBeDefined();

    const helperImports = edges
      .filter((edge) => edge.from === domInternal!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(helperImports).toContain('src/renderer/child-shape.ts');
    expect(domInternal!.text).not.toMatch(
      /function\s+(warnMissingKeys|hasStaticChildrenMarker|maybeWarnMissingKeys|isFragmentVNode|normalizeComponentChildren|tryGetStaticCreateChildShape|tryGetStaticCreateFastPathShape|isStaticCreateScalarValue)\s*\(/
    );
    expect(domInternal!.text).not.toMatch(
      /type\s+StaticCreateChildShape|STATIC_CHILDREN/
    );
    expect(childShape!.text).not.toMatch(/from\s+['"]\.\/dom['"]/);
  });

  it('should keep renderer reactive child effects split out of the active DOM path', () => {
    const domInternal = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/dom-internal.ts'
    );
    const reactiveChildren = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/reactive-children.ts'
    );
    const reactiveChildSources = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/reactive-child-sources.ts'
    );
    const reactiveChildDom = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/reactive-child-dom.ts'
    );

    expect(domInternal).toBeDefined();
    expect(reactiveChildren).toBeDefined();
    expect(reactiveChildSources).toBeDefined();
    expect(reactiveChildDom).toBeDefined();

    const domHelperImports = edges
      .filter((edge) => edge.from === domInternal!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));
    const reactiveHelperImports = edges
      .filter(
        (edge) => edge.from === reactiveChildren!.filePath && !edge.typeOnly
      )
      .map((edge) => relative(edge.to));

    expect(domHelperImports).toContain('src/renderer/reactive-children.ts');
    expect(reactiveHelperImports).toContain(
      'src/renderer/reactive-child-sources.ts'
    );
    expect(reactiveHelperImports).toContain(
      'src/renderer/reactive-child-dom.ts'
    );
    expect(domInternal!.text).not.toMatch(
      /function\s+(collectReactiveScalarSequenceValue|collectReactiveScalarChildSource|getReactiveScalarChildSource|getSingleReactiveChildBoundarySource|collectReactiveChildBoundarySequenceSource|getReactiveChildBoundarySequenceSource|areReactiveChildBoundarySequenceSourcesEqual|canUpdateReactiveChildBoundarySequenceSource|areReactiveScalarChildSourcesEqual|getOrCreateElementReactiveCleanupMap|normalizeReactiveScalarSequenceValues|normalizeOwnedReactiveTextValue|collectReactiveChildValuesAsVNodes|materializeReactiveChildBoundaryNodes|syncReactiveScalarTextNodes|trySyncScalarChildSequenceInPlace|normalizeReactiveChildBoundaryVNode|isSingleRootReactiveChildBoundaryValue|collectReactiveChildBoundaryVNodes|createReactiveChildBoundaryHost|disposeReactiveChildBoundaryNodes|syncReactiveChildExpectedNodes|commitReactiveChildBoundaryEntryNodes|syncReactiveChildSequenceNodes|setupReactiveScalarChild|setupReactiveChildBoundary|setupReactiveChildBoundarySequence|syncReactiveScalarChild)\s*\(/
    );
    expect(domInternal!.text).not.toMatch(
      /type\s+(ReactiveScalarChildSourceSlot|ReactiveScalarChildSource|ReactiveChildBoundarySequenceSource|ReactiveChildBoundarySequenceEntry)|reactiveChildScopeId|REACTIVE_CHILDREN_KEY|elementReactivePropsCleanup|createFineGrainedEffect/
    );
    expect(domInternal!.text).not.toMatch(
      /from\s+['"]\.\.\/runtime\/child-scope['"]/
    );
    expect(reactiveChildren!.text).not.toMatch(
      /function\s+(materializeReactiveChildBoundaryNodes|createReactiveChildBoundaryHost|disposeReactiveChildBoundaryNodes|syncReactiveChildExpectedNodes|commitReactiveChildBoundaryEntryNodes|syncReactiveChildSequenceNodes|syncReactiveScalarTextNodes)\s*\(|type\s+ReactiveChildBoundarySequenceEntry\s*=/
    );
    expect(reactiveChildren!.text).not.toMatch(/from\s+['"]\.\/dom['"]/);
    expect(reactiveChildSources!.text).not.toMatch(/from\s+['"]\.\/dom['"]/);
    expect(reactiveChildDom!.text).not.toMatch(/from\s+['"]\.\/dom['"]/);
  });

  it('should keep the component facade free of lifecycle implementation logic', () => {
    const facade = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/component.ts'
    );

    expect(facade).toBeDefined();
    expect(facade!.text).not.toMatch(
      /function\s+(createComponentInstance|commitRenderedComponent|mountInstanceInline|renderComponentInline|executeComponent|cleanupComponent|claimHookIndex)/
    );

    for (const [filePath, maxLines] of RUNTIME_COMPONENT_FACADE_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep component lifecycle batching split out of component internals', () => {
    const componentInternal = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/component-internal.ts'
    );
    const componentLifecycle = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/component-lifecycle.ts'
    );

    expect(componentInternal).toBeDefined();
    expect(componentLifecycle).toBeDefined();

    const helperImports = edges
      .filter(
        (edge) => edge.from === componentInternal!.filePath && !edge.typeOnly
      )
      .map((edge) => relative(edge.to));

    expect(helperImports).toContain('src/runtime/component-lifecycle.ts');
    expect(componentInternal!.text).not.toMatch(
      /function\s+(beginLifecycleCommitBatch|closeLifecycleCommitBatch|enqueueLifecycleCommit|enqueueReadSubscriptionCommit|enqueueInlineRenderSnapshot|finalizeInlineReadSubscriptions|flushLifecycleCommitBatch|discardLifecycleCommitBatch|settleLifecycleOperationResult|executeMountOperations|executeCommitOperations|discardCommitOperations|executeCommittedLifecycleOperations|commitLifecycleForInstance)\s*\(/
    );
    expect(componentInternal!.text).not.toMatch(
      /type\s+(LifecycleOperation|LifecycleCommitBatchEntry|ReadSubscriptionCommit|InlineRenderSnapshot|LifecycleCommitBatch)\s*=|let\s+currentLifecycleCommitBatch\s*:/
    );

    for (const [filePath, maxLines] of RUNTIME_COMPONENT_HELPER_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep scheduled component DOM commit orchestration split out of component internals', () => {
    const componentInternal = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/component-internal.ts'
    );
    const componentCommit = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/component-commit.ts'
    );

    expect(componentInternal).toBeDefined();
    expect(componentCommit).toBeDefined();

    const helperImports = edges
      .filter(
        (edge) => edge.from === componentInternal!.filePath && !edge.typeOnly
      )
      .map((edge) => relative(edge.to));

    expect(helperImports).toContain('src/runtime/component-commit.ts');
    expect(componentInternal!.text).not.toMatch(/function\s+runComponent\s*\(/);
    expect(componentInternal!.text).not.toMatch(
      /\btryRuntimeFastLaneSync\b|\bgetRuntimeRenderer\b|\bbeginLifecycleCommitBatch\b|\bdiscardLifecycleCommitBatch\b|\bflushLifecycleCommitBatch\b|\benterDomCommitScope\b|\brestoreDomCommitScope\b/
    );
    expect(componentInternal!.text).not.toMatch(
      /__LAST_DOM_REPLACE_STACK_COMPONENT_(?:RESTORE|ROLLBACK)|placeholder no longer in DOM, cannot render component/
    );
  });

  it('should keep component scope ownership split out of component internals', () => {
    const componentInternal = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/component-internal.ts'
    );
    const componentScope = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/component-scope.ts'
    );

    expect(componentInternal).toBeDefined();
    expect(componentScope).toBeDefined();

    const helperImports = edges
      .filter(
        (edge) => edge.from === componentInternal!.filePath && !edge.typeOnly
      )
      .map((edge) => relative(edge.to));

    expect(helperImports).toContain('src/runtime/component-scope.ts');
    expect(componentInternal!.text).not.toMatch(
      /let\s+(_globalRenderCounter|globalRenderCounter|currentInstance|currentPortalScope|stateIndex)\s*=/
    );
    expect(componentInternal!.text).not.toMatch(
      /function\s+(ensureAbortController|nextRenderToken|resetRenderState)\s*\(/
    );
    expect(componentInternal!.text).not.toMatch(
      /export\s+function\s+(getCurrentComponentInstance|setCurrentComponentInstance|getCurrentPortalScope|getCurrentInstance|getSignal|getNextStateIndex|claimHookIndex|getCurrentStateIndex|resetStateIndex|setStateIndex)\s*\(/
    );
    expect(componentInternal!.text).not.toMatch(
      /\benterDomCommitScope\b|\brestoreDomCommitScope\b/
    );

    for (const [filePath, maxLines] of RUNTIME_COMPONENT_HELPER_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep component cleanup and owned child-scope disposal split out of component internals', () => {
    const componentInternal = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/component-internal.ts'
    );
    const componentCleanup = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/component-cleanup.ts'
    );

    expect(componentInternal).toBeDefined();
    expect(componentCleanup).toBeDefined();

    const helperImports = edges
      .filter(
        (edge) => edge.from === componentInternal!.filePath && !edge.typeOnly
      )
      .map((edge) => relative(edge.to));

    expect(helperImports).toContain('src/runtime/component-cleanup.ts');
    expect(componentInternal!.text).not.toMatch(
      /function\s+(cleanupComponent|registerOwnedChildScope|unregisterOwnedChildScope)\s*\(/
    );
    expect(componentInternal!.text).not.toMatch(
      /type\s+OwnedChildScope\s*=|\bcleanupReadableSubscriptions\b|\bclearCurrentComponentScope\b|\brestoreCurrentComponentScope\b/
    );
    expect(componentInternal!.text).not.toMatch(
      /child scope cleanup threw|cleanup function threw|readable subscription cleanup threw|abort controller cleanup threw|Cleanup failed for component/
    );
  });

  it('should keep the For facade free of reconciliation implementation logic', () => {
    const facade = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/for.ts'
    );

    expect(facade).toBeDefined();
    expect(facade!.text).not.toMatch(
      /function\s+(createForState|useForState|createItemInstance|reconcileForItems|evaluateForState|clearForDomUpdateState)/
    );

    for (const [filePath, maxLines] of RUNTIME_FOR_FACADE_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep selector dirty-flush scheduling split out of selector hook logic', () => {
    const selector = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/selector.ts'
    );
    const selectorStore = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/selector-store.ts'
    );

    expect(selector).toBeDefined();
    expect(selectorStore).toBeDefined();
    expect(selector!.text).not.toMatch(
      /const\s+dirtySelectorRecords\s*=|let\s+hasPendingSelectorFlush\s*=|function\s+scheduleSelectorFlush\s*\(/
    );

    const selectorImports = edges
      .filter((edge) => edge.from === selector!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(selectorImports).toContain('src/runtime/selector-store.ts');
  });

  it('should keep For state ownership free of control-layer type imports', () => {
    const forInternal = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/for-internal.ts'
    );
    const forTypes = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/for-types.ts'
    );

    expect(forInternal).toBeDefined();
    expect(forTypes).toBeDefined();
    expect(forInternal!.text).not.toMatch(/from\s+['"]\.\.\/control\/for['"]/);
  });

  it('should keep For reactive item signals split out of reconciliation ownership', () => {
    const forInternal = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/for-internal.ts'
    );
    const forReconcile = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/for-reconcile.ts'
    );
    const forScopes = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/for-scopes.ts'
    );
    const forSignals = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/for-signals.ts'
    );

    expect(forInternal).toBeDefined();
    expect(forReconcile).toBeDefined();
    expect(forScopes).toBeDefined();
    expect(forSignals).toBeDefined();

    const helperImports = edges
      .filter((edge) => edge.from === forScopes!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(helperImports).toContain('src/runtime/for-signals.ts');
    expect(forInternal!.text).not.toMatch(
      /function\s+(createForIndexSignal|syncForIndexSignal|createForItemSignal|createForItemPropertySignal|readForItemProperty|haveSameOwnKeys|scopeReadsSource|removeForParentReaders|getOrCreateForItemPropertySignal|canProxyForItem|createReactiveForItem)\s*\(/
    );
    expect(forReconcile!.text).not.toMatch(
      /function\s+(createForIndexSignal|syncForIndexSignal|createForItemSignal|createForItemPropertySignal|readForItemProperty|haveSameOwnKeys|scopeReadsSource|removeForParentReaders|getOrCreateForItemPropertySignal|canProxyForItem|createReactiveForItem)\s*\(/
    );

    for (const [filePath, maxLines] of RUNTIME_FOR_HELPER_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep For item and fallback child scopes split out of reconciliation ownership', () => {
    const forReconcile = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/for-reconcile.ts'
    );
    const forScopes = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/for-scopes.ts'
    );

    expect(forReconcile).toBeDefined();
    expect(forScopes).toBeDefined();

    const helperImports = edges
      .filter((edge) => edge.from === forReconcile!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(helperImports).toContain('src/runtime/for-scopes.ts');
    expect(forReconcile!.text).not.toMatch(
      /function\s+(syncForItemIndex|materializeItemVnode|renderItemScope|disposeItemInstance|createItemInstance|rerenderItemInstance|updateItemInstance|disposeFallbackScope|renderFallbackScope|disposeAllItems)\s*\(/
    );
    expect(forReconcile!.text).not.toMatch(
      /interface\s+ForItemInstance|type\s+RemovedDomCleanupMode\s*=|const\s+FOR_FALLBACK_SCOPE_KEY\s*=/
    );

    for (const [filePath, maxLines] of RUNTIME_FOR_HELPER_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep For key validation and reconciliation strategy split out of state ownership', () => {
    const forInternal = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/for-internal.ts'
    );
    const forReconcile = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/for-reconcile.ts'
    );

    expect(forInternal).toBeDefined();
    expect(forReconcile).toBeDefined();

    const helperImports = edges
      .filter((edge) => edge.from === forInternal!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(helperImports).toContain('src/runtime/for-reconcile.ts');
    expect(forInternal!.text).not.toMatch(
      /function\s+(failForValidation|validateForKeys|reconcileForItems)\s*\(/
    );
    expect(forInternal!.text).not.toMatch(
      /FAST PATH [ABC]|FULL KEYED RECONCILIATION|\brecordBenchFastLane\b/
    );
  });

  it('should keep runtime operations split into resource and lifecycle owners', () => {
    const operations = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/operations.ts'
    );
    const resourceOperation = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/resource-operation.ts'
    );
    const lifecycleOperations = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/lifecycle-operations.ts'
    );

    expect(operations).toBeDefined();
    expect(resourceOperation).toBeDefined();
    expect(lifecycleOperations).toBeDefined();
    expect(operations!.text).not.toMatch(
      /function\s+(resource|routeActive|documentVisible|windowFocused|on|timer|stream|task|capture|normalizePredicates|getLifecycleSlot|commitListenerSlot|commitTimerSlot)\s*\(/
    );

    const operationsImports = edges
      .filter((edge) => edge.from === operations!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(operationsImports).toContain('src/runtime/resource-operation.ts');
    expect(operationsImports).toContain('src/runtime/lifecycle-operations.ts');
    expect(resourceOperation!.text).not.toMatch(
      /function\s+(routeActive|documentVisible|windowFocused|on|timer|stream|task|capture|normalizePredicates|getLifecycleSlot)\s*\(/
    );
    expect(lifecycleOperations!.text).not.toMatch(
      /new\s+ResourceCell\b|\bgetCurrentRenderData\b|\bthrowSSRDataMissing\b/
    );

    for (const [filePath, maxLines] of RUNTIME_OPERATIONS_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep the SSR facade free of synchronous renderer internals', () => {
    const facade = sourceFiles.find(
      (file) => file.relativePath === 'src/ssr/index.ts'
    );

    expect(facade).toBeDefined();
    expect(facade!.text).not.toMatch(
      /function\s+(renderToStringSync|renderToString|renderToStream|resolveRequest|renderNodeSync|verifyRenderableNode|executeComponentSync)/
    );

    for (const [filePath, maxLines] of SSR_FACADE_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep SSR route and document orchestration split out of the synchronous renderer cluster', () => {
    const ssrInternal = sourceFiles.find(
      (file) => file.relativePath === 'src/ssr/index-internal.ts'
    );
    const routeRender = sourceFiles.find(
      (file) => file.relativePath === 'src/ssr/route-render.ts'
    );

    expect(ssrInternal).toBeDefined();
    expect(routeRender).toBeDefined();
    expect(ssrInternal!.text).not.toMatch(
      /function\s+(resolveSSRRouteSource|resolveSSRRouteRender|buildDocumentRenderArgs|renderResolvedRouteAppToSink|renderToSinkInternal)\s*\(/
    );

    const ssrImports = edges
      .filter((edge) => edge.from === ssrInternal!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(ssrImports).toContain('src/ssr/route-render.ts');

    for (const [filePath, maxLines] of SSR_ROUTE_RENDER_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep SSR component execution split out of the synchronous renderer cluster', () => {
    const ssrInternal = sourceFiles.find(
      (file) => file.relativePath === 'src/ssr/index-internal.ts'
    );
    const renderSync = sourceFiles.find(
      (file) => file.relativePath === 'src/ssr/render-sync.ts'
    );
    const componentRuntime = sourceFiles.find(
      (file) => file.relativePath === 'src/ssr/component-runtime.ts'
    );

    expect(ssrInternal).toBeDefined();
    expect(renderSync).toBeDefined();
    expect(componentRuntime).toBeDefined();
    expect(ssrInternal!.text).not.toMatch(
      /function\s+(pushSSRStrictPurityGuard|popSSRStrictPurityGuard|executeComponentSync|disposeSSRTemporaryOwners|wrapWithDefaultPortal|renderSyncComponentRoot)\s*\(/
    );
    expect(ssrInternal!.text).not.toMatch(/\b__ssrGuardStack\b/);

    const renderSyncImports = edges
      .filter((edge) => edge.from === renderSync!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(renderSyncImports).toContain('src/ssr/component-runtime.ts');

    for (const [filePath, maxLines] of SSR_COMPONENT_RUNTIME_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep default portal ownership under runtime rather than foundations', () => {
    const foundationsPortal = sourceFiles.find(
      (file) => file.relativePath === 'src/foundations/structures/portal.tsx'
    );
    const runtimePortal = sourceFiles.find(
      (file) => file.relativePath === 'src/runtime/portal.ts'
    );

    expect(foundationsPortal).toBeDefined();
    expect(runtimePortal).toBeDefined();
    expect(foundationsPortal!.text).not.toMatch(
      /let\s+_defaultPortalStates\s*=|function\s+(writeDefaultPortal|resolveDefaultPortalScope|applyPendingDefaultPortalValue|registerDefaultPortalOwner)\s*\(|export\s+const\s+DefaultPortal/
    );

    const forbidden = edges
      .filter((edge) => !edge.typeOnly)
      .filter((edge) =>
        [
          'src/boot/root-lifecycle.ts',
          'src/router/navigation-targets.ts',
          'src/ssr/component-runtime.ts',
        ].includes(relative(edge.from))
      )
      .filter(
        (edge) => relative(edge.to) === 'src/foundations/structures/portal.tsx'
      )
      .map(formatEdge)
      .sort();

    expect(forbidden).toEqual([]);
  });

  it('should keep SSR boundary state and fallback helpers split out of the synchronous renderer cluster', () => {
    const ssrInternal = sourceFiles.find(
      (file) => file.relativePath === 'src/ssr/index-internal.ts'
    );
    const renderSync = sourceFiles.find(
      (file) => file.relativePath === 'src/ssr/render-sync.ts'
    );
    const boundaries = sourceFiles.find(
      (file) => file.relativePath === 'src/ssr/boundaries.ts'
    );

    expect(ssrInternal).toBeDefined();
    expect(renderSync).toBeDefined();
    expect(boundaries).toBeDefined();
    expect(ssrInternal!.text).not.toMatch(
      /function\s+(normalizeRenderableChildren|getRenderableChildren|getErrorBoundaryState|resetErrorBoundaryState|createErrorBoundaryReset|createDefaultErrorBoundaryFallbackVNode|resolveErrorBoundaryFallbackNode|getControlBoundaryState|evaluateControlBoundaryChildren)\s*\(/
    );
    expect(ssrInternal!.text).not.toMatch(
      /data-askr-error-boundary|Something went wrong while rendering this view|\bevaluateForState\b|\bevaluateShowState\b|\bevaluateCaseState\b/
    );

    const renderSyncImports = edges
      .filter((edge) => edge.from === renderSync!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(renderSyncImports).toContain('src/ssr/boundaries.ts');

    for (const [filePath, maxLines] of SSR_BOUNDARY_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep SSR sync rendering and hydration verification split out of public orchestration', () => {
    const ssrInternal = sourceFiles.find(
      (file) => file.relativePath === 'src/ssr/index-internal.ts'
    );
    const renderSync = sourceFiles.find(
      (file) => file.relativePath === 'src/ssr/render-sync.ts'
    );
    const hydrationData = sourceFiles.find(
      (file) => file.relativePath === 'src/ssr/hydration-data.ts'
    );
    const hydrationVerify = sourceFiles.find(
      (file) => file.relativePath === 'src/ssr/hydration-verify.ts'
    );

    expect(ssrInternal).toBeDefined();
    expect(renderSync).toBeDefined();
    expect(hydrationData).toBeDefined();
    expect(hydrationVerify).toBeDefined();
    expect(ssrInternal!.text).not.toMatch(
      /function\s+(inheritRenderableKey|renderRenderableSync|renderChildSync|renderRenderableSyncToSink|renderChildSyncToSink|serializeHydrationRenderData|renderChildrenSync|renderErrorBoundaryFallbackValue|renderErrorBoundaryFallbackValueToSink|renderChildrenSyncToSink|sinkWrite2|sinkWrite3|renderNodeSync|renderNodeSyncToSink|flushPendingText|verifyRenderedAttrs|verifyExpectedNode|verifyExpectedChildren|verifyRenderableNode)\s*\(|type\s+VerifyState\s*=/
    );

    const ssrImports = edges
      .filter((edge) => edge.from === ssrInternal!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));
    const renderSyncImports = edges
      .filter((edge) => edge.from === renderSync!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(ssrImports).toContain('src/ssr/render-sync.ts');
    expect(ssrImports).toContain('src/ssr/hydration-verify.ts');
    expect(renderSyncImports).toContain('src/ssr/hydration-data.ts');

    for (const [filePath, maxLines] of SSR_INTERNAL_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep SSG route preparation and generation planning split out of static generation orchestration', () => {
    const createStaticGen = sourceFiles.find(
      (file) => file.relativePath === 'src/ssg/create-static-gen.ts'
    );
    const generationPlan = sourceFiles.find(
      (file) => file.relativePath === 'src/ssg/generation-plan.ts'
    );
    const staticRoutes = sourceFiles.find(
      (file) => file.relativePath === 'src/ssg/static-routes.ts'
    );

    expect(createStaticGen).toBeDefined();
    expect(generationPlan).toBeDefined();
    expect(staticRoutes).toBeDefined();
    expect(createStaticGen!.text).not.toMatch(
      /function\s+(getRuntimeOnlyDiagnostic|createRuntimeOnlyRoute|splitStaticRoutes|routeRegistryToRouteConfigs|stripRegistryGuestPolicies|normalizeStaticRoutes|dedupeStrings|getRoutesToRender|selectRouteForGeneration|collectRemovedRouteResults)\s*\(/
    );

    const createStaticGenImports = edges
      .filter(
        (edge) => edge.from === createStaticGen!.filePath && !edge.typeOnly
      )
      .map((edge) => relative(edge.to));

    expect(createStaticGenImports).toContain('src/ssg/generation-plan.ts');
    expect(createStaticGenImports).toContain('src/ssg/static-routes.ts');

    for (const [filePath, maxLines] of SSG_ORCHESTRATION_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep remaining runtime owner modules under explicit ceilings', () => {
    for (const [filePath, maxLines] of [
      ...RUNTIME_COMPONENT_OWNER_MODULES,
      ...RUNTIME_FOR_OWNER_MODULES,
    ]) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should reject source files above the architecture drift line limit', () => {
    const oversized = sourceFiles
      .filter(
        (file) =>
          file.text.split(/\r?\n/).length > ARCHITECTURE_DRIFT_LINE_LIMIT
      )
      .map((file) => file.relativePath)
      .sort();

    expect(oversized).toEqual([]);
  });
});
