import fs from 'node:fs';
import { execSync } from 'node:child_process';
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

function readDocsCode(): string {
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
  const inline = text.replace(/```[\s\S]*?```/g, '').match(/`[^`\n]+`/g) ?? [];
  return [...fenced, ...inline].join('\n');
}

function publicEntrypoints(): Array<[string, string]> {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
  ) as { exports: Record<string, string | { types?: string }> };
  const entrypoints = Object.entries(packageJson.exports).flatMap(
    ([subpath, conditions]): Array<[string, string]> => {
      if (subpath === './package.json' || subpath === './capabilities.json') {
        return [];
      }
      const types =
        typeof conditions === 'string' ? conditions : conditions.types;
      return typeof types === 'string'
        ? [[subpath, path.join(rootDir, types)]]
        : [];
    }
  );
  if (entrypoints.some(([, file]) => !fs.existsSync(file))) {
    execSync('npm run build', { cwd: rootDir, stdio: 'ignore' });
  }
  return entrypoints;
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
    const docsCode = readDocsCode();
    const undocumented: string[] = [];

    for (const [subpath, file] of entrypoints) {
      const source = program.getSourceFile(file);
      const moduleSymbol = source && checker.getSymbolAtLocation(source);
      if (!moduleSymbol) throw new Error(`Unable to read ${subpath}`);

      for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
        const name = symbol.getName();
        const target =
          symbol.flags & ts.SymbolFlags.Alias
            ? checker.getAliasedSymbol(symbol)
            : symbol;
        const mentioned = new RegExp(`\\b${name}\\b`).test(docsCode);
        if (target.flags & ts.SymbolFlags.Value) {
          if (!mentioned) undocumented.push(`${subpath} value ${name}`);
          continue;
        }
        const comment = ts
          .displayPartsToString(target.getDocumentationComment(checker))
          .trim();
        if (!mentioned && comment === '') {
          undocumented.push(`${subpath} type ${name}`);
        }
      }
    }

    expect(undocumented).toEqual([]);
  }, 60_000);
});
