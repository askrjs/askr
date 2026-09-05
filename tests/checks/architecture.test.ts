import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
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
          format(edge) === 'src/boot/index.ts -> src/ssr/verify-hydration.ts'
      )
    ).toBe(true);
  });

  it('should retain empty-import side effects and exclude named type-only re-exports', () => {
    const file = path.join(srcDir, 'runtime', 'context.ts');
    const source = ts.createSourceFile(
      file,
      `
      import {} from './ownership';
      import { type OwnershipRecord } from './ownership';
      export { type OwnershipRecord } from './ownership';
      export { OwnershipRecord, type OwnedChildScope } from './ownership';
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
      if (relative === 'src/renderer/dom-ownership.ts') continue;
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

  it('should keep subsystem imports on explicit runtime capability entrypoints', () => {
    const entrypoints = new Set([
      'src/runtime/index.ts',
      'src/runtime/ownership.ts',
      'src/runtime/component-generation.ts',
      'src/runtime/component-capabilities.ts',
      'src/runtime/component-scope.ts',
      'src/runtime/component-cleanup.ts',
      'src/runtime/child-scope.ts',
      'src/runtime/transaction-access.ts',
    ]);
    const optionalCapabilityEdges = new Set([
      // The foundations entry is the explicit opt-in boundary that registers
      // portal support without retaining it in every runtime consumer.
      'src/foundations/structures/portal.tsx -> src/runtime/portal.ts',
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
      'src/runtime/transaction-access.ts',
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
    const owner = path.join(srcDir, 'runtime', 'ownership.ts');
    expect(sourcePaths.has(owner)).toBe(true);
    expect(
      edges.filter((edge) => edge.from === owner && !edge.typeOnly).map(format)
    ).toEqual([]);
    const cleanup = path.join(srcDir, 'runtime', 'component-cleanup.ts');
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
        'src/renderer/reconcile.ts',
        'src/renderer/reconcile-commit.ts'
      )
    ).toBe(true);
    expect(
      hasValueEdge(
        'src/renderer/reconcile-commit.ts',
        'src/renderer/cleanup.ts'
      )
    ).toBe(true);
    expect(
      hasValueEdge(
        'src/renderer/cleanup.ts',
        'src/runtime/transaction-access.ts'
      )
    ).toBe(true);
  });
});
