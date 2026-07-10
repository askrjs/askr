import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vite-plus/test';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const srcDir = path.join(rootDir, 'src');
const extensions = ['.ts', '.tsx', '.mts', '.cts'] as const;
const areas = new Set(['boot', 'common', 'data', 'renderer', 'router', 'runtime', 'ssg', 'ssr']);

type Source = { file: string; relative: string; source: ts.SourceFile };
type Edge = { from: string; to: string; typeOnly: boolean };

function collect(dir: string): Source[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return collect(file);
    if (!extensions.some((extension) => entry.name.endsWith(extension)) || /\.d\.(?:ts|mts|cts)$/.test(entry.name)) return [];
    const text = fs.readFileSync(file, 'utf8');
    return [{ file, relative: path.relative(rootDir, file).replaceAll(path.sep, '/'), source: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, entry.name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS) }];
  });
}

const sources = collect(srcDir);
const sourcePaths = new Set(sources.map(({ file }) => file));

function resolve(from: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), specifier);
  const candidates = [base, ...extensions.map((extension) => `${base}${extension}`), ...extensions.map((extension) => path.join(base, `index${extension}`))];
  return candidates.find((candidate) => sourcePaths.has(candidate)) ?? null;
}

function isTypeOnly(clause: ts.ImportClause | undefined): boolean {
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name || !clause.namedBindings || ts.isNamespaceImport(clause.namedBindings)) return false;
  return clause.namedBindings.elements.every((element) => element.isTypeOnly);
}

const edges: Edge[] = sources.flatMap(({ file, source }) => source.statements.flatMap((statement) => {
  if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
    const to = resolve(file, statement.moduleSpecifier.text);
    return to ? [{ from: file, to, typeOnly: isTypeOnly(statement.importClause) }] : [];
  }
  if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
    const to = resolve(file, statement.moduleSpecifier.text);
    return to ? [{ from: file, to, typeOnly: statement.isTypeOnly }] : [];
  }
  return [];
}));

function relative(file: string): string { return path.relative(rootDir, file).replaceAll(path.sep, '/'); }
function area(file: string): string { return relative(file).split('/')[1] ?? ''; }
function format(edge: Edge): string { return `${relative(edge.from)} -> ${relative(edge.to)}`; }

function findCycles(): string[] {
  const graph = new Map<string, Set<string>>();
  for (const edge of edges.filter((edge) => !edge.typeOnly)) {
    const from = area(edge.from); const to = area(edge.to);
    if (!areas.has(from) || !areas.has(to) || from === to) continue;
    (graph.get(from) ?? graph.set(from, new Set()).get(from)!).add(to);
  }
  const cycles = new Set<string>();
  function visit(start: string, current: string, trail: string[], seen: Set<string>): void {
    for (const next of graph.get(current) ?? []) {
      if (next === start) cycles.add([...trail, start].join(' -> '));
      else if (!seen.has(next) && next >= start) { seen.add(next); visit(start, next, [...trail, next], seen); seen.delete(next); }
    }
  }
  for (const node of [...graph.keys()].sort()) visit(node, node, [node], new Set([node]));
  return [...cycles].sort();
}

describe('architecture boundaries', () => {
  it('should keep governed paths free of .mts sources', () => {
    const paths = ['src', 'tests', 'docs', 'benches', 'examples', 'test-utils', 'types', 'scripts', 'tooling'];
    const findMts = (dir: string): string[] => !fs.existsSync(dir) ? [] : fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? findMts(path.join(dir, entry.name)) : entry.name.endsWith('.mts') ? [path.relative(rootDir, path.join(dir, entry.name))] : []);
    expect(paths.flatMap((entry) => findMts(path.join(rootDir, entry))).sort()).toEqual([]);
  });

  it('should keep subsystem value dependencies acyclic', () => {
    expect(findCycles()).toEqual([]);
  });

  it('should keep the runtime independent from concrete platform implementations', () => {
    const forbidden = edges.filter((edge) => !edge.typeOnly && area(edge.from) === 'runtime').filter((edge) => ['renderer', 'boot', 'ssr', 'ssg'].includes(area(edge.to)) || relative(edge.to) === 'src/router/navigate.ts').map(format).sort();
    expect(forbidden).toEqual([]);
  });

  it('should keep runtime internals behind the runtime facade for external consumers', () => {
    const forbidden = edges.filter((edge) => !edge.typeOnly && area(edge.from) !== 'runtime').filter((edge) => relative(edge.to).startsWith('src/runtime/') && relative(edge.to) !== 'src/runtime/index.ts').map(format).sort();
    expect(forbidden).toEqual([]);
  });

  it('should keep default singletons behind their access boundary', () => {
    const allowed = new Set(['src/runtime/access.ts', 'src/runtime/runtime.ts', 'src/runtime/index.ts', 'src/fx/index.ts']);
    const forbidden = edges.filter((edge) => !edge.typeOnly && ['src/runtime/scheduler.ts', 'src/runtime/runtime.ts'].includes(relative(edge.to)) && !allowed.has(relative(edge.from))).map(format).sort();
    expect(forbidden).toEqual([]);
  });

  it('should separate server rendering from browser DOM implementation', () => {
    const forbidden = edges.filter((edge) => !edge.typeOnly && ['ssr', 'ssg'].includes(area(edge.from)) && area(edge.to) === 'renderer').map(format).sort();
    expect(forbidden).toEqual([]);
  });

  it('should use one component cleanup owner for child disposal, cleanup, abort, and stale-work invalidation', () => {
    const cleanup = sources.find((source) => source.relative === 'src/runtime/component-cleanup.ts');
    expect(cleanup).toBeDefined();
    const text = fs.readFileSync(cleanup!.file, 'utf8');
    expect(text).toContain('scope.dispose()');
    expect(text).toContain('cleanup()');
    expect(text).toContain('abortController.abort()');
    expect(text).toContain('instance.lifecycleGeneration++');
    expect(text).toContain('instance.evaluationGeneration++');
  });

  it('should keep reconciliation mutation transactional through its commit boundary', () => {
    const reconcile = sources.find((source) => source.relative === 'src/renderer/reconcile.ts');
    const commit = sources.find((source) => source.relative === 'src/renderer/reconcile-commit.ts');
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
