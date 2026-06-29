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

const OVERSIZED_FILE_EXEMPTIONS = new Map<string, string>([
  ['src/boot/index.ts', 'legacy browser composition entrypoint'],
  ['src/data/index.ts', 'legacy data API barrel and state machines'],
  ['src/renderer/dom.ts', 'legacy renderer implementation cluster'],
  ['src/renderer/reconcile.ts', 'legacy reconciliation implementation cluster'],
  ['src/router/navigate.ts', 'legacy browser navigation driver cluster'],
  ['src/router/route.ts', 'legacy route registry and runtime cluster'],
  ['src/runtime/component.ts', 'legacy component lifecycle cluster'],
  ['src/runtime/for.ts', 'legacy For reconciliation cluster'],
  ['src/ssr/index.ts', 'legacy SSR renderer cluster'],
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
  const relativePath = path.relative(srcDir, filePath).replaceAll(path.sep, '/');
  return relativePath.split('/')[0] ?? '';
}

function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith('./') || specifier.startsWith('../');
}

function resolveRelativeImport(fromFile: string, specifier: string): string | null {
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

function importClauseIsTypeOnly(importClause: ts.ImportClause | undefined): boolean {
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

describe('architecture boundaries', () => {
  it('keeps runtime independent from concrete platform subsystems', () => {
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

  it('keeps renderer on narrow runtime contracts instead of component internals', () => {
    const forbidden = edges
      .filter((edge) => topLevelArea(edge.from) === 'renderer')
      .filter((edge) => relative(edge.to) === 'src/runtime/component.ts')
      .map(formatEdge);

    expect(forbidden).toEqual([]);
  });

  it('keeps subsystem value imports acyclic', () => {
    expect(findAreaCycles(edges)).toEqual([]);
  });

  it('keeps hidden singleton bridge globals out of runtime code', () => {
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

  it('requires explicit exemptions for oversized responsibility clusters', () => {
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
