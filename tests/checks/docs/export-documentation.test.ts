import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from '@typescript/typescript6';
import { describe, expect, it } from 'vite-plus/test';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);
const contractsDir = path.join(rootDir, 'src/public-contracts');

interface DocsIndex {
  /** Inline code spans, without their backticks. */
  inline: string[];
  /** Names imported in fenced examples, by module specifier. */
  imports: Map<string, Set<string>>;
}

function readDocs(): DocsIndex {
  const files = [
    path.join(rootDir, 'README.md'),
    ...(
      fs.readdirSync(path.join(rootDir, 'docs'), {
        recursive: true,
      }) as string[]
    )
      .filter((file) => file.endsWith('.md'))
      .map((file) => path.join(rootDir, 'docs', file)),
  ];
  const text = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const fenced = text.match(/```[\s\S]*?```/g) ?? [];
  const inline = (
    text.replace(/```[\s\S]*?```/g, '').match(/`[^`\n]+`/g) ?? []
  ).map((span) => span.slice(1, -1));
  const imports = new Map<string, Set<string>>();
  for (const block of fenced) {
    for (const [, names, specifier] of block.matchAll(
      /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'/g
    )) {
      const set = imports.get(specifier!) ?? new Set<string>();
      for (const entry of names!.split(',')) {
        const name = entry.replace(/^\s*type\s+/, '').split(/\s+as\s+/)[0]!;
        if (name.trim()) set.add(name.trim());
      }
      imports.set(specifier!, set);
    }
  }
  return { inline, imports };
}

const escape = (name: string) => name.replace(/[$]/g, '\\$');

/**
 * A value is documented when an example imports it from its entrypoint, or an
 * inline code span calls it (`name(`), reads a member (`name.`), renders it
 * (`<Name`), or names a PascalCase export exactly. Bare lowercase spans do not
 * count, since names such as `type` or `click` also appear as ordinary words.
 */
function documentsValue(docs: DocsIndex, specifier: string, name: string) {
  if (docs.imports.get(specifier)?.has(name)) return true;
  const call = new RegExp(`^${escape(name)}[(.<]`);
  const element = new RegExp(`^<${escape(name)}(?:[\\s>/]|$)`);
  return docs.inline.some((span) =>
    span === name
      ? /^[A-Z]/.test(name)
      : call.test(span) || element.test(span)
  );
}

function documentsType(docs: DocsIndex, specifier: string, name: string) {
  if (docs.imports.get(specifier)?.has(name)) return true;
  return docs.inline.some((span) =>
    new RegExp(`(?:^|[^\\w$])${escape(name)}(?:$|[^\\w$])`).test(span)
  );
}

/** Package subpaths and their hand-maintained contract sources. */
function publicEntrypoints(): Array<[string, string]> {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
  ) as { exports: Record<string, string | { types?: string }> };
  return Object.entries(packageJson.exports).flatMap(
    ([subpath, conditions]): Array<[string, string]> => {
      const types =
        typeof conditions === 'string' ? conditions : conditions.types;
      if (typeof types !== 'string' || !types.startsWith('./dist/')) return [];
      const source = path.join(contractsDir, types.slice('./dist/'.length));
      if (!fs.existsSync(source)) {
        throw new Error(`No contract source for ${subpath}: ${source}`);
      }
      return [[subpath, source]];
    }
  );
}

describe('public export documentation', () => {
  it('should document every public value and give every public type a doc comment or docs mention', () => {
    const entrypoints = publicEntrypoints();
    const program = ts.createProgram(
      entrypoints.map(([, file]) => file),
      {
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        skipLibCheck: true,
      }
    );
    const checker = program.getTypeChecker();
    const docs = readDocs();
    const undocumented: string[] = [];

    for (const [subpath, file] of entrypoints) {
      const specifier = `@askrjs/askr${subpath.slice(1)}`;
      const source = program.getSourceFile(file);
      const moduleSymbol = source && checker.getSymbolAtLocation(source);
      if (!moduleSymbol) throw new Error(`Unable to read ${subpath}`);

      for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
        const name = symbol.getName();
        const target =
          symbol.flags & ts.SymbolFlags.Alias
            ? checker.getAliasedSymbol(symbol)
            : symbol;
        if (target.flags & ts.SymbolFlags.Value) {
          if (!documentsValue(docs, specifier, name)) {
            undocumented.push(`${subpath} value ${name}`);
          }
          continue;
        }
        const comment = ts
          .displayPartsToString(target.getDocumentationComment(checker))
          .trim();
        if (comment === '' && !documentsType(docs, specifier, name)) {
          undocumented.push(`${subpath} type ${name}`);
        }
      }
    }

    expect(undocumented).toEqual([]);
  }, 60_000);
});
