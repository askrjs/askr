import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vite-plus/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');
const testsTypesDir = path.join(rootDir, 'tests', 'types');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
) as {
  exports: Record<string, { types?: string }>;
};

function resolveSourcePath(subpath: string): string | null {
  if (subpath === '.') {
    return path.join(rootDir, 'src', 'index.ts');
  }

  const target = packageJson.exports[subpath]?.types;
  if (!target) {
    return null;
  }

  return path.join(
    rootDir,
    target
      .replace('./dist/', 'src/')
      .replace(/\/index\.d\.ts$/, '/index.ts')
      .replace(/\.d\.ts$/, '.ts')
  );
}

function collectExportedNames(filePath: string): string[] {
  const source = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const names = new Set<string>();

  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          names.add(element.name.text);
        }
      }
      continue;
    }

    const modifiers = ts.canHaveModifiers(statement)
      ? ts.getModifiers(statement)
      : undefined;
    const isExported = modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
    );
    if (!isExported) {
      continue;
    }

    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      if (statement.name) {
        names.add(statement.name.text);
      }
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          names.add(declaration.name.text);
        }
      }
    }
  }

  return [...names];
}

function collectReferencedNames(): Set<string> {
  const referenced = new Set<string>();
  const files = fs
    .readdirSync(testsTypesDir)
    .filter((file) => /\.test-d\.(ts|tsx)$/.test(file));

  for (const file of files) {
    const filePath = path.join(testsTypesDir, file);
    const source = ts.createSourceFile(
      filePath,
      fs.readFileSync(filePath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const visit = (node: ts.Node) => {
      if (ts.isIdentifier(node)) {
        referenced.add(node.text);
      }
      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return referenced;
}

describe('public API type coverage', () => {
  it('should reference every public export directly in tests/types', () => {
    const referencedNames = collectReferencedNames();
    const uncovered: string[] = [];

    for (const subpath of Object.keys(packageJson.exports)) {
      const sourcePath = resolveSourcePath(subpath);
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        continue;
      }

      for (const exportName of collectExportedNames(sourcePath)) {
        if (!referencedNames.has(exportName)) {
          uncovered.push(`${subpath} -> ${exportName}`);
        }
      }
    }

    expect(uncovered).toEqual([]);
  });

  it('should keep runtime operations independent from router internals', () => {
    const operationsSource = fs.readFileSync(
      path.join(rootDir, 'src', 'runtime', 'operations.ts'),
      'utf8'
    );

    expect(operationsSource).not.toMatch(/from ['"]\.\.\/router\//);
  });
});
