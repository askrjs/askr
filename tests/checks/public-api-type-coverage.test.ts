import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from '@typescript/typescript6';
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
  it.each([
    [
      'rootSurface.createRuntime',
      'declare const rootSurface: { createRuntime(): void };',
      'declare const rootSurface: {};',
    ],
    [
      "import('@askrjs/askr').JSXElement",
      'export interface JSXElement { readonly type: string; }',
      'export {};',
    ],
  ])(
    'should reject a restored export through the actual %s absence assertion',
    (needle, present, absent) => {
      const lines = fs
        .readFileSync(
          path.join(testsTypesDir, 'public-entrypoints.test-d.ts'),
          'utf8'
        )
        .split('\n');
      const index = lines.findIndex((line) => line.includes(needle));
      expect(index).toBeGreaterThan(0);
      expect(lines[index - 1]).toContain('@ts-expect-error');
      const assertion = lines
        .slice(index - 1, index + 1)
        .join('\n')
        .replace("'@askrjs/askr'", "'./exports.js'");
      const diagnostics = (declaration: string) => {
        const value = needle.startsWith('rootSurface.');
        const files: Record<string, string> = {
          '/probe.ts': `declare function expectType<T>(value: T): void;\n${value ? declaration : ''}\n${assertion}`,
          '/exports.d.ts': value ? 'export {};' : declaration,
        };
        const options = {
          noLib: true,
          module: ts.ModuleKind.NodeNext,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
        };
        const host = ts.createCompilerHost(options);
        host.fileExists = (file) => file in files;
        host.readFile = (file) => files[file];
        host.getSourceFile = (file) =>
          file in files
            ? ts.createSourceFile(
                file,
                files[file]!,
                ts.ScriptTarget.Latest,
                true
              )
            : undefined;
        const program = ts.createProgram(Object.keys(files), options, host);
        return program
          .getSemanticDiagnostics(program.getSourceFile('/probe.ts')!)
          .map(({ code }) => code);
      };
      expect(diagnostics(absent)).toEqual([]);
      expect(diagnostics(present)).toEqual([2578]);
    }
  );

  it('should exercise consumer contracts instead of asserting a function against itself', () => {
    const selfAssertions: string[] = [];
    for (const file of fs
      .readdirSync(testsTypesDir)
      .filter((name) => /\.test-d\.(ts|tsx)$/.test(name))) {
      const source = ts.createSourceFile(
        file,
        fs.readFileSync(path.join(testsTypesDir, file), 'utf8'),
        ts.ScriptTarget.Latest,
        true
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          node.expression.getText(source) === 'expectType' &&
          node.typeArguments?.length === 1 &&
          node.arguments.length === 1
        ) {
          const type = node.typeArguments[0]!;
          if (
            ts.isTypeQueryNode(type) &&
            type.exprName.getText(source) === node.arguments[0]!.getText(source)
          ) {
            selfAssertions.push(`${file}: ${node.getText(source)}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(selfAssertions).toEqual([]);
  });

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

  it('should keep the core independent from router internals', () => {
    const coreDir = path.join(rootDir, 'src', 'core');
    const importers = fs
      .readdirSync(coreDir, { recursive: true, encoding: 'utf8' })
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) =>
        /from ['"](?:\.\.\/)+router\//.test(
          fs.readFileSync(path.join(coreDir, file), 'utf8')
        )
      );

    expect(importers).toEqual([]);
  });
});
