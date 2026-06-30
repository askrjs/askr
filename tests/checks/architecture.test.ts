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

const OVERSIZED_FILE_EXEMPTIONS = new Map<string, string>([
  [
    'src/renderer/dom-internal.ts',
    'Temporary architecture debt: DOM renderer implementation still owns element creation, reactive props and children, component host handoff, boundaries, and static reuse.',
  ],
  [
    'src/runtime/component-internal.ts',
    'Temporary architecture debt: component implementation still owns instance creation, component function execution, inline rendering, and cleanup.',
  ],
]);

const OVERSIZED_LINE_LIMIT = 900;
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
  ['src/boot/index.ts', OVERSIZED_LINE_LIMIT],
  ['src/boot/types.ts', 120],
]);

const DATA_SPLIT_MODULES = new Map<string, number>([
  ['src/data/index.ts', OVERSIZED_LINE_LIMIT],
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
  ['src/router/navigate.ts', 900],
  ['src/router/navigation-scroll.ts', 240],
  ['src/router/rendering.ts', 180],
  ['src/router/resolution.ts', 700],
  ['src/router/store.ts', 420],
]);

const RENDERER_RECONCILE_MODULES = new Map<string, number>([
  ['src/renderer/keyed-children.ts', 120],
  ['src/renderer/keyed.ts', 360],
  ['src/renderer/namespaces.ts', 90],
  ['src/renderer/reconcile.ts', OVERSIZED_LINE_LIMIT],
]);

const RENDERER_DOM_FACADE_MODULES = new Map<string, number>([
  ['src/renderer/dom.ts', 20],
]);

const RENDERER_DOM_HELPER_MODULES = new Map<string, number>([
  ['src/renderer/attributes.ts', 520],
  ['src/renderer/boundaries.ts', 760],
]);

const RUNTIME_COMPONENT_FACADE_MODULES = new Map<string, number>([
  ['src/runtime/component.ts', 20],
]);

const RUNTIME_COMPONENT_HELPER_MODULES = new Map<string, number>([
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

const INTERNAL_IMPLEMENTATION_CLUSTER_MODULES = new Map<
  string,
  { maxLines: number; name: string }
>([
  [
    'src/renderer/dom-internal.ts',
    { maxLines: 3900, name: 'DOM renderer implementation cluster' },
  ],
  [
    'src/runtime/component-internal.ts',
    { maxLines: 680, name: 'component implementation cluster' },
  ],
  [
    'src/runtime/for-internal.ts',
    { maxLines: 320, name: 'For state implementation cluster' },
  ],
  [
    'src/ssr/index-internal.ts',
    { maxLines: 900, name: 'SSR serialization implementation cluster' },
  ],
]);

const SINGLETON_IMPORT_ALLOWLIST = new Set([
  'src/runtime/access.ts',
  'src/runtime/runtime.ts',
]);

const RUNTIME_SCHEDULER_VALUE_IMPORT_ALLOWLIST = new Set([
  'src/fx/index.ts',
  'src/runtime/access.ts',
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

    expect(boot).toBeDefined();
    expect(boot!.text).not.toMatch(
      /function\s+(takeHydrationRenderData|markSkippedElements|collectDeferredBelowFoldBoundaries|applySelectiveHydration)|type\s+BootRouteSource|export\s+type\s+(SPAConfig|HydrateSPAConfig|IslandConfig)/
    );

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

    expect(data).toBeDefined();
    expect(data!.text).not.toMatch(
      /function\s+(serializeQueryKeyPart|serializeQueryKeyNumber|createReadableSource|notifySource|isAbortError|normalizeAsyncDataError)|type\s+(QueryLoading|QueryFresh|QueryRefreshing|QueryPendingWrite|QueryStaleValue|QueryStaleErrorWithValue|QueryStaleError|MutationIdle|MutationPending|MutationSuccess|MutationError)|interface\s+(DataRuntime|DataRuntimeOptions|InvalidateOptions|QueryScope)/
    );

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
    expect(navigate).toBeDefined();
    expect(navigate!.text).not.toMatch(
      /scrollPositions|scrollRestorationOptions|function readScrollPosition/
    );

    for (const [filePath, maxLines] of ROUTER_SPLIT_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep keyed child snapshots split out of the reconcile orchestrator', () => {
    const reconcile = sourceFiles.find(
      (file) => file.relativePath === 'src/renderer/reconcile.ts'
    );

    expect(reconcile).toBeDefined();
    expect(reconcile!.text).not.toMatch(
      /function\s+(buildDOMKeyMap|extractKeyedVnodes|getParentNamespace|resolveChildNamespace)|interface\s+KeyedVnode/
    );

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

    expect(domInternal).toBeDefined();
    expect(boundaries).toBeDefined();

    const helperImports = edges
      .filter((edge) => edge.from === domInternal!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(helperImports).toContain('src/renderer/attributes.ts');
    expect(helperImports).toContain('src/renderer/boundaries.ts');

    expect(domInternal!.text).not.toMatch(
      /function\s+(applyFormControlProp|applyStaticScalarPropsToElement|applyClassPropValue|applyStylePropValue|removeStaleAttributes|materializeKey|hasMatchingStaticProps|evaluateControlBoundaryState|getDirectControlBoundaryVNode|registerControlBoundaryCommitOwner|commitForBoundaryChildren|syncForItemDom|trySyncControlBoundaryChild)\s*\(/
    );
    expect(domInternal!.text).not.toMatch(
      /const\s+controlBoundaryOwners\s*=|type\s+ControlBoundaryCommitOwnerState\s*=/
    );
    expect(boundaries!.text).not.toMatch(/from\s+['"]\.\/dom['"]/);

    for (const [filePath, maxLines] of RENDERER_DOM_HELPER_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
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
    expect(componentInternal!.text).not.toMatch(
      /function\s+runComponent\s*\(/
    );
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
    const componentRuntime = sourceFiles.find(
      (file) => file.relativePath === 'src/ssr/component-runtime.ts'
    );

    expect(ssrInternal).toBeDefined();
    expect(componentRuntime).toBeDefined();
    expect(ssrInternal!.text).not.toMatch(
      /function\s+(pushSSRStrictPurityGuard|popSSRStrictPurityGuard|executeComponentSync|disposeSSRTemporaryOwners|wrapWithDefaultPortal|renderSyncComponentRoot)\s*\(/
    );
    expect(ssrInternal!.text).not.toMatch(/\b__ssrGuardStack\b/);

    const ssrImports = edges
      .filter((edge) => edge.from === ssrInternal!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(ssrImports).toContain('src/ssr/component-runtime.ts');

    for (const [filePath, maxLines] of SSR_COMPONENT_RUNTIME_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should keep SSR boundary state and fallback helpers split out of the synchronous renderer cluster', () => {
    const ssrInternal = sourceFiles.find(
      (file) => file.relativePath === 'src/ssr/index-internal.ts'
    );
    const boundaries = sourceFiles.find(
      (file) => file.relativePath === 'src/ssr/boundaries.ts'
    );

    expect(ssrInternal).toBeDefined();
    expect(boundaries).toBeDefined();
    expect(ssrInternal!.text).not.toMatch(
      /function\s+(normalizeRenderableChildren|getRenderableChildren|getErrorBoundaryState|resetErrorBoundaryState|createErrorBoundaryReset|createDefaultErrorBoundaryFallbackVNode|resolveErrorBoundaryFallbackNode|getControlBoundaryState|evaluateControlBoundaryChildren)\s*\(/
    );
    expect(ssrInternal!.text).not.toMatch(
      /data-askr-error-boundary|Something went wrong while rendering this view|\bevaluateForState\b|\bevaluateShowState\b|\bevaluateCaseState\b/
    );

    const ssrImports = edges
      .filter((edge) => edge.from === ssrInternal!.filePath && !edge.typeOnly)
      .map((edge) => relative(edge.to));

    expect(ssrImports).toContain('src/ssr/boundaries.ts');

    for (const [filePath, maxLines] of SSR_BOUNDARY_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(maxLines);
    }
  });

  it('should track temporary internal implementation clusters with current line ceilings', () => {
    for (const [filePath, debt] of INTERNAL_IMPLEMENTATION_CLUSTER_MODULES) {
      const file = sourceFiles.find((item) => item.relativePath === filePath);
      expect(file, `${filePath} should exist`).toBeDefined();
      expect(debt.name.length).toBeGreaterThan(10);
      expect(file!.text.split(/\r?\n/).length).toBeLessThanOrEqual(
        debt.maxLines
      );
    }
  });

  it('should require explicit exemptions for oversized responsibility clusters', () => {
    const oversized = sourceFiles
      .filter((file) => file.text.split(/\r?\n/).length > OVERSIZED_LINE_LIMIT)
      .map((file) => file.relativePath)
      .filter((filePath) => !OVERSIZED_FILE_EXEMPTIONS.has(filePath))
      .sort();

    expect(oversized).toEqual([]);

    for (const [filePath, reason] of OVERSIZED_FILE_EXEMPTIONS) {
      expect(reason.length).toBeGreaterThan(10);
      expect(fs.existsSync(path.join(rootDir, filePath))).toBe(true);
    }
  });
});
