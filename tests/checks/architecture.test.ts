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
  'core',
  'data',
  'router',
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

function violatesPublicationBoundary(edge: Edge): boolean {
  return (
    relative(edge.from) === 'src/ssg/output-publication.ts' &&
    !edge.typeOnly &&
    (relative(edge.to).startsWith('src/router/') ||
      relative(edge.to).startsWith('src/ssr/') ||
      relative(edge.to) === 'src/ssg/create-static-gen.ts')
  );
}

function violatesSSROutputBoundary(edge: Edge): boolean {
  const target = relative(edge.to);
  return (
    relative(edge.from).startsWith('src/ssr/output-') &&
    !edge.typeOnly &&
    !target.startsWith('src/ssr/output-') &&
    ![
      'src/ssr/attrs.ts',
      'src/ssr/escape.ts',
      'src/ssr/sink.ts',
      'src/common/portal.ts',
    ].includes(target)
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
  it('should keep SSR output infrastructure independent of traversal and route orchestration', () => {
    expect(edges.filter(violatesSSROutputBoundary).map(format)).toEqual([]);
    expect(
      edges.some(
        (edge) =>
          relative(edge.from) === 'src/ssr/render-sync.ts' &&
          relative(edge.to).startsWith('src/ssr/output-') &&
          !edge.typeOnly
      )
    ).toBe(true);
  });

  it('should reject SSR output rendering edges while allowing type-only context dependencies', () => {
    const file = path.join(srcDir, 'ssr', 'output-portals.ts');
    const source = ts.createSourceFile(
      file,
      `
      import './render-sync';
      export * from './route-render';
      import '../boot/hydrate-spa';
      import '../core/component/instance';
      import type { RenderContext } from './context';
      import '../common/portal';
      import './sink';
    `,
      ts.ScriptTarget.Latest,
      true
    );
    expect(
      collectEdges(file, source).filter(violatesSSROutputBoundary).map(format)
    ).toEqual([
      'src/ssr/output-portals.ts -> src/ssr/render-sync.ts',
      'src/ssr/output-portals.ts -> src/ssr/route-render.ts',
      'src/ssr/output-portals.ts -> src/boot/hydrate-spa.ts',
      'src/ssr/output-portals.ts -> src/core/component/instance.ts',
    ]);
  });

  it('should keep SSG publication infrastructure independent of route rendering', () => {
    expect(edges.filter(violatesPublicationBoundary).map(format)).toEqual([]);
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

  it('should keep core implementation value dependencies acyclic', () => {
    expect(
      findModuleCycles().filter((group) =>
        group.some((file) => file.startsWith('src/core/'))
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
    const file = path.join(srcDir, 'core', 'reactive', 'graph.ts');
    const source = ts.createSourceFile(
      file,
      `
      import {} from './owner';
      import { type Owner } from './owner';
      export { type Owner } from './owner';
      export { Owner, type OwnerNode } from './owner';
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

  it('should keep the core independent from concrete platform implementations', () => {
    const forbidden = edges
      .filter((edge) => !edge.typeOnly && area(edge.from) === 'core')
      .filter((edge) =>
        ['boot', 'router', 'ssr', 'ssg'].includes(area(edge.to))
      )
      .map(format)
      .sort();
    expect(forbidden).toEqual([]);
  });

  it('should keep browser globals and node inspection out of the reactive graph', () => {
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
    for (const { relative, source } of sources.filter(({ relative }) =>
      relative.startsWith('src/core/reactive/')
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

  it('should keep core modules free of import-time configuration', () => {
    // Wiring a host is composition. Doing it at module scope means importing a
    // core module for a type mutates global state, and the order of unrelated
    // imports decides whether a host is installed.
    const violations: string[] = [];
    for (const { file, relative, source } of sources) {
      if (area(file) !== 'core') continue;
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

  it('should not declare one core operation name in two modules', () => {
    // Two functions sharing a name across modules read as one operation. That
    // hid a real difference in the retired renderer: both key-map builders
    // wrote the same `keyedElements` cache while traversing the DOM by
    // different rules.
    const declared = new Map<string, string[]>();
    for (const { file, relative, source } of sources) {
      if (area(file) !== 'core') continue;
      for (const statement of source.statements) {
        const name = ts.isFunctionDeclaration(statement)
          ? statement.name?.text
          : undefined;
        if (!name) continue;
        const sites = declared.get(name) ?? [];
        if (!sites.includes(relative)) declared.set(name, [...sites, relative]);
      }
    }
    // Names still shared across core modules. This list must shrink.
    expect(
      [...declared.entries()]
        .filter(([, sites]) => sites.length > 1)
        .map(([name, sites]) => `${name}: ${sites.join(', ')}`)
        .sort()
    ).toEqual([
      'element: src/core/api/control.ts, src/core/api/error-boundary.ts',
      'stopGeneration: src/core/api/lifecycle.ts, src/core/api/stream.ts',
      'withOwner: src/core/api/hooks.ts, src/core/dom/reconcile.ts',
    ]);
  });

  it('should not duplicate core accessors under a second name', () => {
    // Two exported functions with the same body and the same declared return
    // type are one operation wearing two names; callers then split arbitrarily
    // between them, as getCurrentInstance and getCurrentComponentInstance did.
    const bodies = new Map<string, string[]>();
    for (const { file, relative, source } of sources) {
      if (area(file) !== 'core') continue;
      for (const statement of source.statements) {
        if (
          !ts.isFunctionDeclaration(statement) ||
          !statement.name ||
          !statement.body ||
          !statement.modifiers?.some(
            (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
          )
        )
          continue;
        const body = statement.body.getText(source).replace(/\s+/g, ' ');
        if (body === '{ }' || body === '{}') continue;
        // Same body under a different declared return type is interface
        // segregation over one value, not an alias, so keep the type in the key.
        const returns = statement.type?.getText(source) ?? '';
        const key = `${body} @@ ${statement.parameters.length} @@ ${returns}`;
        bodies.set(key, [
          ...(bodies.get(key) ?? []),
          `${relative}:${statement.name.text}`,
        ]);
      }
    }
    expect([...bodies.values()].filter((sites) => sites.length > 1)).toEqual(
      []
    );
  });

  it('should separate server rendering from browser DOM implementation', () => {
    const forbidden = edges
      .filter(
        (edge) =>
          !edge.typeOnly &&
          ['ssr', 'ssg'].includes(area(edge.from)) &&
          relative(edge.to).startsWith('src/core/dom/')
      )
      .map(format)
      .sort();
    expect(forbidden).toEqual([]);
  });
});
