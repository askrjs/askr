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

interface DocPage {
  text: string;
  /** Inline code spans, without their backticks. */
  inline: string[];
  /** Names imported in fenced examples, by module specifier. */
  imports: Map<string, Set<string>>;
}

function readDocs(): DocPage[] {
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
  return files.map((file) => {
    const text = fs.readFileSync(file, 'utf8');
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
    return { text, inline, imports };
  });
}

const escape = (name: string) => name.replace(/[$]/g, '\\$');

/** Whether `page` is about `specifier`: it names that exact module path. */
function namesEntrypoint(page: DocPage, specifier: string): boolean {
  return new RegExp(`${specifier.replace(/[/]/g, '\\/')}(?![\\w/-])`).test(
    page.text
  );
}

/**
 * A value is documented when an example imports it from its entrypoint, or a
 * page that names the entrypoint has an inline code span that calls it
 * (`name(`), reads a member (`name.x`, not a file name such as `index.html`),
 * renders it (`<Name`), or names a PascalCase export exactly. Bare lowercase
 * spans do not count, since names such as `type` or `click` are also ordinary
 * words. The check is a floor: it proves a mention in the right place, not a
 * complete description.
 */
function documentsValue(pages: DocPage[], specifier: string, name: string) {
  const call = new RegExp(
    `^${escape(name)}(?:[(<]|\\.(?!(?:html|tsx?|jsx?|mjs|md|json|css)\\b))`
  );
  const element = new RegExp(`^<${escape(name)}(?:[\\s>/]|$)`);
  return pages.some(
    (page) =>
      page.imports.get(specifier)?.has(name) ||
      (namesEntrypoint(page, specifier) &&
        page.inline.some((span) =>
          span === name
            ? /^[A-Z]/.test(name)
            : call.test(span) || element.test(span)
        ))
  );
}

function documentsType(pages: DocPage[], specifier: string, name: string) {
  const mention = new RegExp(`(?:^|[^\\w$])${escape(name)}(?:$|[^\\w$])`);
  return pages.some(
    (page) =>
      page.imports.get(specifier)?.has(name) ||
      page.inline.some((span) => mention.test(span))
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
    const pages = readDocs();
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
          if (!documentsValue(pages, specifier, name)) {
            undocumented.push(`${subpath} value ${name}`);
          }
          continue;
        }
        const comment = ts
          .displayPartsToString(target.getDocumentationComment(checker))
          .trim();
        if (comment === '' && !documentsType(pages, specifier, name)) {
          undocumented.push(`${subpath} type ${name}`);
        }
      }
    }

    expect(undocumented).toEqual([]);
  }, 60_000);
});
