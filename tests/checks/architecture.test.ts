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

const OVERSIZED_FILE_EXEMPTIONS = new Map<string, string>([]);

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

function collectSourceFiles(dir: string): SourceFile[] {
  const result: SourceFile[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectSourceFiles(filePath));
      continue;
    }

    if (!/\.(ts|tsx)$/.test(entry.name) || entry.name.endsWith('.d.ts')) {
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
        entry.name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      ),
      text,
    });
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
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.tsx'),
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

const RUNTIME_COMPONENT_FACADE_MODULES = new Map<string, number>([
  ['src/runtime/component.ts', 20],
]);

const RUNTIME_FOR_FACADE_MODULES = new Map<string, number>([
  ['src/runtime/for.ts', 20],
]);

const SSR_FACADE_MODULES = new Map<string, number>([['src/ssr/index.ts', 20]]);

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
