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
  return clause.namedBindings.elements.every((element) => element.isTypeOnly);
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
      add(
        statement.moduleSpecifier.text,
        statement.isTypeOnly ? 'type' : 'export',
        statement.isTypeOnly
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

describe('architecture boundaries', () => {
  const extractedModuleBudgets = [
    'src/renderer/intrinsic-blueprint-analysis.ts',
    'src/renderer/intrinsic-blueprint-bindings.ts',
    'src/renderer/intrinsic-blueprint-materialization.ts',
    'src/renderer/intrinsic-blueprint-types.ts',
    'src/renderer/boundary-materialization.ts',
    'src/renderer/boundary-commit-owner.ts',
    'src/renderer/boundary-range-adoption.ts',
    'src/renderer/boundary-range-cleanup.ts',
    'src/renderer/boundary-range-placement.ts',
    'src/renderer/boundary-range-sync.ts',
    'src/renderer/boundary-state.ts',
    'src/renderer/component-host-creation.ts',
    'src/renderer/component-host-nested-results.ts',
    'src/renderer/component-host-replacement.ts',
    'src/renderer/component-host-results.ts',
    'src/renderer/for-commit-ranges.ts',
    'src/renderer/hydration-boundaries.ts',
    'src/renderer/hydration-listener-transaction.ts',
    'src/runtime/render-transaction.ts',
    'src/runtime/lifecycle-operation-settlement.ts',
  ] as const;

  const targetedOriginalModuleBudgets = [
    { relativePath: 'src/renderer/intrinsic-blueprint.ts', baselineLines: 994 },
    { relativePath: 'src/renderer/boundaries.ts', baselineLines: 510 },
    { relativePath: 'src/renderer/component-host.ts', baselineLines: 907 },
    { relativePath: 'src/runtime/component-lifecycle.ts', baselineLines: 551 },
  ] as const;

  const lineCount = (relativePath: string): number =>
    fs.readFileSync(path.join(rootDir, relativePath), 'utf8').split(/\r?\n/)
      .length - 1;

  it('should shrink targeted original modules by at least 35%', () => {
    const overBudget = targetedOriginalModuleBudgets
      .filter(
        ({ relativePath, baselineLines }) =>
          lineCount(relativePath) > Math.floor(baselineLines * 0.65)
      )
      .map(({ relativePath }) => relativePath);
    expect(overBudget).toEqual([]);
  });

  it('should keep extracted renderer implementations below the complexity budget', () => {
    const overBudget = extractedModuleBudgets.filter((relativePath) => {
      return lineCount(relativePath) >= 400;
    });
    expect(overBudget).toEqual([]);
  });

  it('should keep the intrinsic blueprint facade below its pre-extraction size', () => {
    // The dirty checkpoint contained the combined 994-line implementation;
    // the facade is intentionally held to 65% of that source size or less.
    expect(
      lineCount('src/renderer/intrinsic-blueprint.ts')
    ).toBeLessThanOrEqual(646);
  });

  it('should keep the extraction internal to the public API and type snapshot', () => {
    const publicSnapshot = fs.readFileSync(
      path.join(rootDir, 'tests/checks/public-api.snapshot.json'),
      'utf8'
    );
    for (const relativePath of extractedModuleBudgets) {
      expect(publicSnapshot).not.toContain(relativePath);
    }
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

  it('should keep reconciliation mutation transactional through its commit boundary', () => {
    const reconcile = sources.find(
      (source) => source.relative === 'src/renderer/reconcile.ts'
    );
    const commit = sources.find(
      (source) => source.relative === 'src/renderer/reconcile-commit.ts'
    );
    expect(reconcile).toBeDefined();
    expect(commit).toBeDefined();
    const reconcileText = fs.readFileSync(reconcile!.file, 'utf8');
    const commitText = fs.readFileSync(commit!.file, 'utf8');
    expect(reconcileText).toContain("from './reconcile-commit'");
    expect(commitText).toContain('try');
    expect(commitText).toContain('catch');
    expect(commitText).toContain('replaceChildren');
  });
});
