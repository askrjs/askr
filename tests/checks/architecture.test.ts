import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from '@typescript/typescript6';
import { describe, expect, it } from 'vite-plus/test';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
const srcDir = path.join(rootDir, 'src');
const extensions = ['.ts', '.tsx', '.mts', '.cts'] as const;
const areas = new Set([
  'boot',
  'common',
  'data',
  'renderer',
  'router',
  'runtime',
  'ssg',
  'ssr',
]);

type Source = { file: string; relative: string; source: ts.SourceFile };
type EdgeKind = 'value' | 'type' | 'export' | 'dynamic';
type Edge = { from: string; to: string; typeOnly: boolean; kind: EdgeKind };

function collect(dir: string): Source[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return collect(file);
    if (
      !extensions.some((extension) => entry.name.endsWith(extension)) ||
      /\.d\.(?:ts|mts|cts)$/.test(entry.name)
    )
      return [];
    const text = fs.readFileSync(file, 'utf8');
    return [
      {
        file,
        relative: path.relative(rootDir, file).replaceAll(path.sep, '/'),
        source: ts.createSourceFile(
          file,
          text,
          ts.ScriptTarget.Latest,
          true,
          entry.name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
        ),
      },
    ];
  });
}

const sources = collect(srcDir);
const sourcePaths = new Set(sources.map(({ file }) => file));

function resolve(from: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), specifier);
  const candidates = [
    base,
    ...extensions.map((extension) => `${base}${extension}`),
    ...extensions.map((extension) => path.join(base, `index${extension}`)),
  ];
  return candidates.find((candidate) => sourcePaths.has(candidate)) ?? null;
}

function isTypeOnly(clause: ts.ImportClause | undefined): boolean {
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (
    clause.name ||
    !clause.namedBindings ||
    ts.isNamespaceImport(clause.namedBindings)
  )
    return false;
  return (
    clause.namedBindings.elements.length > 0 &&
    clause.namedBindings.elements.every((element) => element.isTypeOnly)
  );
}

function collectEdges(file: string, source: ts.SourceFile): Edge[] {
  const found: Edge[] = [];
  const add = (
    specifier: string,
    kind: EdgeKind,
    typeOnly = kind === 'type'
  ) => {
    const to = resolve(file, specifier);
    if (to) found.push({ from: file, to, typeOnly, kind });
  };

  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const typeOnly = isTypeOnly(statement.importClause);
      add(
        statement.moduleSpecifier.text,
        typeOnly ? 'type' : 'value',
        typeOnly
      );
      continue;
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const typeOnly =
        statement.isTypeOnly ||
        (statement.exportClause &&
          ts.isNamedExports(statement.exportClause) &&
          statement.exportClause.elements.length > 0 &&
          statement.exportClause.elements.every(
            (element) => element.isTypeOnly
          ));
      add(
        statement.moduleSpecifier.text,
        typeOnly ? 'type' : 'export',
        Boolean(typeOnly)
      );
    }
  }

  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0]!)
    ) {
      add(node.arguments[0]!.text, 'dynamic');
    }
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      add(node.argument.literal.text, 'type', true);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return found;
}

const edges: Edge[] = sources.flatMap(({ file, source }) =>
  collectEdges(file, source)
);

function relative(file: string): string {
  return path.relative(rootDir, file).replaceAll(path.sep, '/');
}
function area(file: string): string {
  return relative(file).split('/')[1] ?? '';
}
function format(edge: Edge): string {
  return `${relative(edge.from)} -> ${relative(edge.to)}`;
}

function violatesVNodeContextBoundary(edge: Edge): boolean {
  return (
    relative(edge.from) === 'src/runtime/context/vnode.ts' &&
    (relative(edge.to).startsWith('src/renderer/') ||
      relative(edge.to) === 'src/runtime/access.ts')
  );
}

function violatesPublicationBoundary(edge: Edge): boolean {
  return (
    relative(edge.from) === 'src/ssg/output-publication.ts' &&
    !edge.typeOnly &&
    (relative(edge.to).startsWith('src/router/') ||
      relative(edge.to).startsWith('src/ssr/') ||
      relative(edge.to) === 'src/ssg/create-static-gen.ts')
  );
}

function findCycles(): string[] {
  const graph = new Map<string, Set<string>>();
  for (const edge of edges.filter((edge) => !edge.typeOnly)) {
    const from = area(edge.from);
    const to = area(edge.to);
    if (!areas.has(from) || !areas.has(to) || from === to) continue;
    (graph.get(from) ?? graph.set(from, new Set()).get(from)!).add(to);
  }
  const cycles = new Set<string>();
  function visit(
    start: string,
    current: string,
    trail: string[],
    seen: Set<string>
  ): void {
    for (const next of graph.get(current) ?? []) {
      if (next === start) cycles.add([...trail, start].join(' -> '));
      else if (!seen.has(next) && next >= start) {
        seen.add(next);
        visit(start, next, [...trail, next], seen);
        seen.delete(next);
      }
    }
  }
  for (const node of [...graph.keys()].sort())
    visit(node, node, [node], new Set([node]));
  return [...cycles].sort();
}

function findModuleCycles(): string[][] {
  const graph = new Map<string, Set<string>>();
  for (const edge of edges.filter((edge) => !edge.typeOnly)) {
    const from = relative(edge.from);
    (graph.get(from) ?? graph.set(from, new Set()).get(from)!).add(
      relative(edge.to)
    );
  }
  const indices = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const active = new Set<string>();
  const components: string[][] = [];
  let cursor = 0;
  const visit = (node: string): void => {
    indices.set(node, cursor);
    low.set(node, cursor++);
    stack.push(node);
    active.add(node);
    for (const child of graph.get(node) ?? []) {
      if (!indices.has(child)) {
        visit(child);
        low.set(node, Math.min(low.get(node)!, low.get(child)!));
      } else if (active.has(child))
        low.set(node, Math.min(low.get(node)!, indices.get(child)!));
    }
    if (low.get(node) !== indices.get(node)) return;
    const group: string[] = [];
    let item: string;
    do {
      item = stack.pop()!;
      active.delete(item);
      group.push(item);
    } while (item !== node);
    if (group.length > 1 || graph.get(node)?.has(node))
      components.push(group.sort());
  };
  for (const node of graph.keys()) if (!indices.has(node)) visit(node);
  return components.sort((left, right) => left[0]!.localeCompare(right[0]!));
}

describe('architecture boundaries', () => {
  it('should keep vnode context propagation independent of DOM renderer capabilities', () => {
    expect(edges.filter(violatesVNodeContextBoundary).map(format)).toEqual([]);
  });

  it('should keep SSG publication infrastructure independent of route rendering', () => {
    expect(edges.filter(violatesPublicationBoundary).map(format)).toEqual([]);
  });

  it('should reject renderer and runtime access edges resolved from nested vnode context', () => {
    const file = path.join(srcDir, 'runtime', 'context', 'vnode.ts');
    const source = ts.createSourceFile(
      file,
      `
      import '../../renderer/ownership/cleanup';
      import type * as RendererTypes from '../../renderer/ownership/cleanup';
      void import('../access');
      import '../ownership/record';
    `,
      ts.ScriptTarget.Latest,
      true
    );
    const found = collectEdges(file, source);
    expect(found).toHaveLength(4);
    expect(found.filter(violatesVNodeContextBoundary).map(format)).toEqual([
      'src/runtime/context/vnode.ts -> src/renderer/ownership/cleanup.ts',
      'src/runtime/context/vnode.ts -> src/renderer/ownership/cleanup.ts',
      'src/runtime/context/vnode.ts -> src/runtime/access.ts',
    ]);
  });

  it('should reject publication rendering edges while allowing type-only dependencies', () => {
    const file = path.join(srcDir, 'ssg', 'output-publication.ts');
    const source = ts.createSourceFile(
      file,
      `
      import '../router/navigate';
      export * from '../ssr/render-sync';
      import './create-static-gen';
      import type * as RouterTypes from '../router/navigate';
      export type * from '../ssr/render-sync';
      import type * as GeneratorTypes from './create-static-gen';
      import './output-path';
    `,
      ts.ScriptTarget.Latest,
      true
    );
    const found = collectEdges(file, source);
    expect(found).toHaveLength(7);
    expect(found.filter(violatesPublicationBoundary).map(format)).toEqual([
      'src/ssg/output-publication.ts -> src/router/navigate.ts',
      'src/ssg/output-publication.ts -> src/ssr/render-sync.ts',
      'src/ssg/output-publication.ts -> src/ssg/create-static-gen.ts',
    ]);
  });

  it('should use narrow renderer access in runtime and renderer helpers', () => {
    const violations: string[] = [];
    for (const { relative, source } of sources) {
      if (
        (!relative.startsWith('src/runtime/') &&
          !relative.startsWith('src/renderer/')) ||
        relative === 'src/runtime/access.ts'
      )
        continue;
      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement)) continue;
        const bindings = statement.importClause?.namedBindings;
        if (
          bindings &&
          ts.isNamedImports(bindings) &&
          bindings.elements.some(
            (element) =>
              (element.propertyName ?? element.name).text ===
              'getRuntimeRenderer'
          )
        )
          violations.push(relative);
      }
    }
    expect(violations).toEqual([]);
  });
  it('should keep runtime and renderer implementation value dependencies acyclic', () => {
    expect(
      findModuleCycles().filter((group) =>
        group.some(
          (file) =>
            file.startsWith('src/runtime/') || file.startsWith('src/renderer/')
        )
      )
    ).toEqual([]);
  });

  it('should keep governed paths free of .mts sources', () => {
    const paths = [
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
    const findMts = (dir: string): string[] =>
      !fs.existsSync(dir)
        ? []
        : fs
            .readdirSync(dir, { withFileTypes: true })
            .flatMap((entry) =>
              entry.isDirectory()
                ? findMts(path.join(dir, entry.name))
                : entry.name.endsWith('.mts')
                  ? [path.relative(rootDir, path.join(dir, entry.name))]
                  : []
            );
    expect(
      paths.flatMap((entry) => findMts(path.join(rootDir, entry))).sort()
    ).toEqual([]);
  });

  it('should keep subsystem value dependencies acyclic', () => {
    expect(findCycles()).toEqual([]);
  });

  it('should classify value, type, export, and dynamic dependency edges', () => {
    const kinds = new Set(edges.map((edge) => edge.kind));
    expect(kinds).toEqual(
      new Set<EdgeKind>(['value', 'type', 'export', 'dynamic'])
    );
    expect(
      edges.some(
        (edge) =>
          edge.kind === 'dynamic' &&
          format(edge) ===
            'src/boot/hydrate-spa.ts -> src/ssr/verify-hydration.ts'
      )
    ).toBe(true);
  });

  it('should retain empty-import side effects and exclude named type-only re-exports', () => {
    const file = path.join(srcDir, 'runtime', 'context', 'context.ts');
    const source = ts.createSourceFile(
      file,
      `
      import {} from '../ownership/record';
      import { type OwnershipRecord } from '../ownership/record';
      export { type OwnershipRecord } from '../ownership/record';
      export { OwnershipRecord, type OwnedChildScope } from '../ownership/record';
    `,
      ts.ScriptTarget.Latest,
      true
    );
    expect(
      collectEdges(file, source).map(({ kind, typeOnly }) => ({
        kind,
        typeOnly,
      }))
    ).toEqual([
      { kind: 'value', typeOnly: false },
      { kind: 'type', typeOnly: true },
      { kind: 'type', typeOnly: true },
      { kind: 'export', typeOnly: false },
    ]);
  });

  it('should keep the runtime independent from concrete platform implementations', () => {
    const forbidden = edges
      .filter((edge) => !edge.typeOnly && area(edge.from) === 'runtime')
      .filter(
        (edge) =>
          ['renderer', 'boot', 'ssr', 'ssg'].includes(area(edge.to)) ||
          relative(edge.to) === 'src/router/navigate.ts'
      )
      .map(format)
      .sort();
    expect(forbidden).toEqual([]);
  });

  it('should keep browser globals and node inspection out of runtime execution', () => {
    const globals = new Set([
      'window',
      'document',
      'Node',
      'Element',
      'HTMLElement',
      'Comment',
      'Text',
      'DocumentFragment',
    ]);
    const nodeProperties = new Set([
      'parentNode',
      'nextSibling',
      'previousSibling',
      'nodeType',
      'childNodes',
      'tagName',
      'textContent',
      'innerHTML',
      'isConnected',
    ]);
    const violations: string[] = [];
    for (const { relative, source } of sources.filter(
      ({ file }) => area(file) === 'runtime'
    )) {
      const visit = (node: ts.Node): void => {
        if (ts.isTypeNode(node)) return;
        if (
          (ts.isIdentifier(node) && globals.has(node.text)) ||
          (ts.isPropertyAccessExpression(node) &&
            nodeProperties.has(node.name.text))
        ) {
          violations.push(
            `${relative}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${node.getText(source)}`
          );
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(violations).toEqual([]);
  });

  it('should update host owner metadata through its renderer index writer', () => {
    const fields = new Set(['__ASKR_INSTANCE', '__ASKR_INSTANCES']);
    const violations: string[] = [];
    for (const { relative, source } of sources) {
      if (relative === 'src/renderer/ownership/nodes.ts') continue;
      const visit = (node: ts.Node): void => {
        const target = ts.isDeleteExpression(node)
          ? node.expression
          : ts.isBinaryExpression(node) &&
              node.operatorToken.kind === ts.SyntaxKind.EqualsToken
            ? node.left
            : undefined;
        if (
          target &&
          ts.isPropertyAccessExpression(target) &&
          fields.has(target.name.text)
        ) {
          violations.push(
            `${relative}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`
          );
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(violations).toEqual([]);
  });

  it('should own router request cancellation in one module', () => {
    // Navigation cancellation belongs to the module owning the request
    // lifetime. resolution.ts keeps one documented never-aborting stand-in for
    // callers that supply no signal; anything else is a second, silent
    // cancellation channel.
    const expected = {
      'src/router/navigation-targets.ts': 1,
      'src/router/resolution.ts': 1,
    };
    const found: Record<string, number> = {};
    for (const { file, relative, source } of sources) {
      if (area(file) !== 'router') continue;
      const visit = (node: ts.Node): void => {
        if (
          ts.isNewExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'AbortController'
        )
          found[relative] = (found[relative] ?? 0) + 1;
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(found).toEqual(expected);
  });

  it('should declare governed renderer operations on a single owner', () => {
    // Each name here is an operation that must have exactly one implementation.
    // A second declaration is how a lossy parallel path gets reintroduced.
    const governed = new Set(['applyPropsToElement']);
    const owners = new Map<string, string[]>();
    for (const { file, relative, source } of sources) {
      if (area(file) !== 'renderer') continue;
      const visit = (node: ts.Node): void => {
        const name =
          ts.isFunctionDeclaration(node) && node.name
            ? node.name.text
            : ts.isVariableDeclaration(node) &&
                ts.isIdentifier(node.name) &&
                node.initializer &&
                (ts.isArrowFunction(node.initializer) ||
                  ts.isFunctionExpression(node.initializer))
              ? node.name.text
              : undefined;
        if (name && governed.has(name))
          owners.set(name, [...(owners.get(name) ?? []), relative]);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(Object.fromEntries(owners)).toEqual({
      applyPropsToElement: ['src/renderer/props/bindings.ts'],
    });
  });

  it('should create renderer DOM nodes through the configured host seam', () => {
    // Node construction belongs to the DOM host. Files in `pending` still build
    // nodes directly; that list must shrink, never grow. A file that stops
    // bypassing the seam has to be removed from it, or this fails.
    const factories = new Set([
      'createElement',
      'createElementNS',
      'createTextNode',
      'createComment',
      'createDocumentFragment',
    ]);
    const permitted = new Set([
      // Owns the native host implementation.
      'src/renderer/dom-internal.ts',
      // Failure-path UI: the fallback has to render when the renderer pipeline
      // is the thing that failed, so it deliberately avoids the seam.
      'src/renderer/component/error-boundary.ts',
    ]);
    const pending = new Set([
      'src/renderer/children/children.ts',
      'src/renderer/children/element-children.ts',
      'src/renderer/children/reactive-children.ts',
      'src/renderer/component/host-fresh-chain.ts',
      'src/renderer/component/host-results.ts',
      'src/renderer/control/materialization.ts',
      'src/renderer/evaluation/range.ts',
      'src/renderer/reconciliation/reconcile-commit.ts',
    ]);
    const bypassing = new Set<string>();
    for (const { file, relative, source } of sources) {
      if (area(file) !== 'renderer') continue;
      const visit = (node: ts.Node): void => {
        if (ts.isTypeNode(node)) return;
        if (
          ts.isPropertyAccessExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'document' &&
          factories.has(node.name.text)
        )
          bypassing.add(relative);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect({
      unexpected: [...bypassing].filter(
        (file) => !permitted.has(file) && !pending.has(file)
      ),
      staleEntries: [...pending].filter((file) => !bypassing.has(file)),
    }).toEqual({ unexpected: [], staleEntries: [] });
  });

  it('should declare shared renderer host shapes once', () => {
    // Consumers narrow the one host contract instead of restating its method
    // shapes. A second declaration is how the copies drifted: the boundary
    // host's local ElementWithContext silently dropped the symbol index
    // signature that the renderer's carries.
    const governed = new Set([
      'ElementWithContext',
      'SyncComponentElement',
      'UpdateElementFromVnode',
      'NativeDOMHost',
    ]);
    const declared = new Map<string, string[]>();
    for (const { file, relative, source } of sources) {
      if (area(file) !== 'renderer') continue;
      const visit = (node: ts.Node): void => {
        const name =
          (ts.isTypeAliasDeclaration(node) ||
            ts.isInterfaceDeclaration(node)) &&
          node.name
            ? node.name.text
            : undefined;
        if (name && governed.has(name))
          declared.set(name, [...(declared.get(name) ?? []), relative]);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(
      [...declared.entries()].filter(([, sites]) => sites.length > 1)
    ).toEqual([]);
  });

  it('should keep renderer modules free of import-time configuration', () => {
    // Wiring a host is composition. Doing it at module scope means importing a
    // renderer module for a type mutates global renderer state, and the order
    // of unrelated imports decides whether a host is installed.
    const violations: string[] = [];
    for (const { file, relative, source } of sources) {
      if (area(file) !== 'renderer') continue;
      for (const statement of source.statements) {
        if (
          ts.isExpressionStatement(statement) &&
          ts.isCallExpression(statement.expression)
        )
          violations.push(
            `${relative}:${
              source.getLineAndCharacterOfPosition(statement.getStart()).line +
              1
            } ${statement.expression.getText(source).slice(0, 40)}`
          );
      }
    }
    expect(violations).toEqual([]);
  });

  it('should not declare one renderer operation name in two modules', () => {
    // Two functions sharing a name across modules read as one operation. That
    // hid a real difference: both key-map builders wrote the same
    // `keyedElements` cache while traversing the DOM by different rules.
    const declared = new Map<string, string[]>();
    for (const { file, relative, source } of sources) {
      if (area(file) !== 'renderer') continue;
      for (const statement of source.statements) {
        const name = ts.isFunctionDeclaration(statement)
          ? statement.name?.text
          : undefined;
        if (!name) continue;
        const sites = declared.get(name) ?? [];
        if (!sites.includes(relative)) declared.set(name, [...sites, relative]);
      }
    }
    const shared = [...declared.entries()]
      .filter(([, sites]) => sites.length > 1)
      .map(([name, sites]) => `${name}: ${sites.join(', ')}`)
      .sort();
    // Names still shared across renderer modules. This list must shrink.
    // Each entry is one operation name with two module-local definitions, so a
    // reader cannot tell which one a call site means. The key-map builders used
    // to be a tenth entry, and they differed: one walked logical child hosts and
    // stepped over range interiors, the other walked raw element children, and
    // both wrote the same `keyedElements` cache.
    expect(shared).toEqual([
      'isControlBoundaryVNode: src/renderer/children/element-children.ts, src/renderer/reconciliation/reconcile-resolution.ts',
      'updateElementChildren: src/renderer/children/element-children.ts, src/renderer/evaluation/reconcile.ts',
    ]);
  });

  it('should export bench instrumentation from its diagnostics owner', () => {
    // control/for-state.ts re-exported seven bench symbols it does not own, so
    // the barrel and every consumer reached them through the For state machine.
    // Only the owning module, and the runtime barrel, may export them onward.
    const owner = 'src/runtime/diagnostics/for-bench.ts';
    const permitted = new Set([owner, 'src/runtime/index.ts']);
    const launderers = edges
      .filter(
        (edge) =>
          relative(edge.to) === owner &&
          edge.kind === 'export' &&
          !permitted.has(relative(edge.from))
      )
      .map(format)
      .sort();
    expect(launderers).toEqual([]);
  });

  it('should reach the scheduler through runtime state, not the singleton', () => {
    // globalScheduler is the default value of defaultRuntimeState.scheduler,
    // not a second way to obtain one. Closing over it hardcodes the default and
    // ignores a runtime constructed with its own scheduler. scheduler.ts may
    // declare it; only runtime-state.ts may name it.
    const violations: string[] = [];
    for (const { file, relative, source } of sources) {
      if (area(file) !== 'runtime') continue;
      if (relative === 'src/runtime/runtime-state.ts') continue;
      const visit = (node: ts.Node): void => {
        const isDeclarationName =
          node.parent &&
          ts.isVariableDeclaration(node.parent) &&
          node.parent.name === node;
        if (
          ts.isIdentifier(node) &&
          node.text === 'globalScheduler' &&
          !isDeclarationName
        )
          violations.push(
            `${relative}:${
              source.getLineAndCharacterOfPosition(node.getStart()).line + 1
            }`
          );
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(violations).toEqual([]);
  });

  it('should keep subsystem imports on explicit runtime capability entrypoints', () => {
    const entrypoints = new Set([
      'src/runtime/index.ts',
      'src/runtime/ownership/record.ts',
      'src/runtime/component/generation.ts',
      'src/runtime/component/capabilities.ts',
      'src/runtime/component/scope.ts',
      'src/runtime/component/cleanup.ts',
      'src/runtime/ownership/child-scope.ts',
      'src/runtime/transactions/access.ts',
    ]);
    const optionalCapabilityEdges = new Set([
      // The foundations entry is the explicit opt-in boundary that registers
      // portal support without retaining it in every runtime consumer.
      'src/foundations/structures/portal.tsx -> src/runtime/portal/portal.ts',
    ]);
    const forbidden = edges
      .filter(
        (edge) =>
          !edge.typeOnly &&
          !['runtime', 'compatibility'].includes(area(edge.from))
      )
      .filter(
        (edge) =>
          relative(edge.to).startsWith('src/runtime/') &&
          !entrypoints.has(relative(edge.to))
      )
      .map(format)
      .filter((edge) => !optionalCapabilityEdges.has(edge))
      .sort();
    expect(forbidden).toEqual([]);
  });

  it('should keep default singletons behind their access boundary', () => {
    const allowed = new Set([
      'src/runtime/access.ts',
      'src/runtime/transactions/access.ts',
      'src/runtime/runtime-state.ts',
      'src/runtime/index.ts',
      'src/fx/index.ts',
    ]);
    const forbidden = edges
      .filter(
        (edge) =>
          !edge.typeOnly &&
          ['src/runtime/scheduler.ts', 'src/runtime/runtime-state.ts'].includes(
            relative(edge.to)
          ) &&
          area(edge.from) !== 'compatibility' &&
          !allowed.has(relative(edge.from))
      )
      .map(format)
      .sort();
    expect(forbidden).toEqual([]);
  });

  it('should keep execution and rendering independent of public compatibility shapes', () => {
    expect(
      edges
        .filter(
          (edge) =>
            ['runtime', 'renderer'].includes(area(edge.from)) &&
            area(edge.to) === 'compatibility'
        )
        .map(format)
    ).toEqual([]);
  });

  it('should separate server rendering from browser DOM implementation', () => {
    const forbidden = edges
      .filter(
        (edge) =>
          !edge.typeOnly &&
          ['ssr', 'ssg'].includes(area(edge.from)) &&
          area(edge.to) === 'renderer'
      )
      .map(format)
      .sort();
    expect(forbidden).toEqual([]);
  });

  it('should keep ownership primitives independent of execution, renderer, and compatibility implementations', () => {
    const owner = path.join(srcDir, 'runtime', 'ownership', 'record.ts');
    expect(sourcePaths.has(owner)).toBe(true);
    expect(
      edges.filter((edge) => edge.from === owner && !edge.typeOnly).map(format)
    ).toEqual([]);
    const cleanup = path.join(srcDir, 'runtime', 'component', 'cleanup.ts');
    expect(
      edges.some(
        (edge) => edge.from === cleanup && edge.to === owner && !edge.typeOnly
      )
    ).toBe(true);
  });

  it('should route reconciliation removal through renderer-owned retirement', () => {
    const hasValueEdge = (from: string, to: string) =>
      edges.some(
        (edge) =>
          !edge.typeOnly &&
          relative(edge.from) === from &&
          relative(edge.to) === to
      );
    expect(
      hasValueEdge(
        'src/renderer/reconciliation/reconcile.ts',
        'src/renderer/reconciliation/reconcile-commit.ts'
      )
    ).toBe(true);
    expect(
      hasValueEdge(
        'src/renderer/reconciliation/reconcile-commit.ts',
        'src/renderer/ownership/cleanup.ts'
      )
    ).toBe(true);
    expect(
      hasValueEdge(
        'src/renderer/ownership/cleanup.ts',
        'src/runtime/transactions/access.ts'
      )
    ).toBe(true);
  });
});
