import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vite-plus/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');
const docsRoots = [path.join(rootDir, 'docs'), path.join(rootDir, 'README.md')];
const testsTsconfigPath = path.join(rootDir, 'tests', 'tsconfig.json');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
) as {
  exports: Record<string, { types?: string }>;
};

type Snippet = {
  filePath: string;
  index: number;
  lang: 'ts' | 'tsx' | 'js' | 'jsx';
  code: string;
};

function collectFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) {
    return [dirPath];
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

function collectPublicExportNames(): Set<string> {
  const names = new Set<string>();

  for (const [subpath, config] of Object.entries(packageJson.exports)) {
    const sourcePath =
      subpath === '.'
        ? path.join(rootDir, 'src', 'index.ts')
        : config.types
          ? path.join(
              rootDir,
              config.types
                .replace('./dist/', 'src/')
                .replace(/\/index\.d\.ts$/, '/index.ts')
                .replace(/\.d\.ts$/, '.ts')
            )
          : null;

    if (!sourcePath || !fs.existsSync(sourcePath)) {
      continue;
    }

    const source = ts.createSourceFile(
      sourcePath,
      fs.readFileSync(sourcePath, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      sourcePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    for (const statement of source.statements) {
      if (ts.isExportDeclaration(statement)) {
        if (
          statement.exportClause &&
          ts.isNamedExports(statement.exportClause)
        ) {
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
  }

  return names;
}

function extractSnippets(filePath: string): Snippet[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const snippets: Snippet[] = [];
  const fencePattern = /```([A-Za-z0-9_-]+)[^\n]*\n([\s\S]*?)```/g;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(content)) !== null) {
    const lang = match[1].toLowerCase();
    if (lang !== 'ts' && lang !== 'tsx' && lang !== 'js' && lang !== 'jsx') {
      continue;
    }

    if (!/@askrjs\/askr(?:\/[A-Za-z0-9/_-]+)?/.test(match[2])) {
      continue;
    }

    index += 1;
    snippets.push({
      filePath,
      index,
      lang,
      code: match[2].trim(),
    });
  }

  return snippets;
}

function loadCompilerOptions(): ts.CompilerOptions {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    testsTsconfigPath,
    {
      noEmit: true,
      allowJs: true,
      checkJs: true,
    },
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic(diagnostic) {
        throw new Error(
          ts.formatDiagnostic(diagnostic, {
            getCanonicalFileName: (fileName) => fileName,
            getCurrentDirectory: () => rootDir,
            getNewLine: () => '\n',
          })
        );
      },
    }
  );

  if (!parsed) {
    throw new Error(
      'Failed to load tests/tsconfig.json for docs snippet checks.'
    );
  }

  return parsed.options;
}

function formatDiagnostic(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (!diagnostic.file || diagnostic.start === undefined) {
    return message;
  }

  const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
    diagnostic.start
  );
  return `${diagnostic.file.fileName}:${line + 1}:${character + 1} ${message}`;
}

function getMissingName(diagnostic: ts.Diagnostic): string | null {
  if (diagnostic.code !== 2304 && diagnostic.code !== 2552) {
    return null;
  }

  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  const match = /Cannot find name '([^']+)'/.exec(message);
  return match?.[1] ?? null;
}

function compileSnippet(
  snippet: Snippet,
  options: ts.CompilerOptions,
  publicExportNames: Set<string>
): string[] {
  const snippetPath = path.join(
    rootDir,
    '__snippet_checks__',
    `${path.basename(snippet.filePath).replace(/[^\w.-]/g, '_')}.${snippet.index}.${snippet.lang}`
  );
  const ambientPath = `${snippetPath}.globals.d.ts`;
  const sourceFiles = new Map<string, string>();
  const stubbedNames = new Set<string>();

  const buildAmbientFile = () =>
    [
      'type __AskrSnippetStub = {',
      "  (...args: readonly unknown[]): import('@askrjs/askr/foundations').JSXElement;",
      '  new (...args: readonly unknown[]): __AskrSnippetStub;',
      '  readonly [key: string]: unknown;',
      '};',
      '',
      ...[...stubbedNames]
        .sort()
        .map(
          (name) =>
            `type ${name} = unknown;\ndeclare const ${name}: __AskrSnippetStub;\n`
        ),
    ].join('\n');

  for (let pass = 0; pass < 5; pass += 1) {
    sourceFiles.set(snippetPath, `${snippet.code}\n`);
    sourceFiles.set(ambientPath, buildAmbientFile());

    const host = ts.createCompilerHost(options, true);
    const originalGetSourceFile = host.getSourceFile.bind(host);
    const originalReadFile = host.readFile.bind(host);
    const originalFileExists = host.fileExists.bind(host);

    host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
      const virtualSource = sourceFiles.get(fileName);
      if (virtualSource !== undefined) {
        return ts.createSourceFile(
          fileName,
          virtualSource,
          languageVersion,
          true,
          fileName.endsWith('.tsx')
            ? ts.ScriptKind.TSX
            : fileName.endsWith('.jsx')
              ? ts.ScriptKind.JSX
              : fileName.endsWith('.js')
                ? ts.ScriptKind.JS
                : ts.ScriptKind.TS
        );
      }

      return originalGetSourceFile(
        fileName,
        languageVersion,
        onError,
        shouldCreate
      );
    };

    host.readFile = (fileName) => {
      const virtualSource = sourceFiles.get(fileName);
      if (virtualSource !== undefined) {
        return virtualSource;
      }

      return originalReadFile(fileName);
    };

    host.fileExists = (fileName) => {
      if (sourceFiles.has(fileName)) {
        return true;
      }

      return originalFileExists(fileName);
    };

    const program = ts.createProgram({
      rootNames: [snippetPath, ambientPath],
      options,
      host,
    });
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter((diagnostic) => diagnostic.file?.fileName === snippetPath);

    const newlyStubbed: string[] = [];
    for (const diagnostic of diagnostics) {
      const missingName = getMissingName(diagnostic);
      if (!missingName || stubbedNames.has(missingName)) {
        continue;
      }

      if (publicExportNames.has(missingName)) {
        continue;
      }

      stubbedNames.add(missingName);
      newlyStubbed.push(missingName);
    }

    if (newlyStubbed.length === 0) {
      return diagnostics.map(formatDiagnostic);
    }
  }

  return [
    `${path.relative(rootDir, snippet.filePath)}#${snippet.index} exceeded missing-name stub passes.`,
  ];
}

describe('public docs snippets', () => {
  it('should compile published docs snippets that import public Askr entrypoints', () => {
    const snippets = docsRoots.flatMap((entry) =>
      collectFiles(entry)
        .filter((filePath) => /\.(md|mdx)$/.test(filePath))
        .flatMap((filePath) => extractSnippets(filePath))
    );

    expect(snippets.length).toBeGreaterThan(0);

    const compilerOptions = loadCompilerOptions();
    const publicExportNames = collectPublicExportNames();
    const failures: string[] = [];

    for (const snippet of snippets) {
      const diagnostics = compileSnippet(
        snippet,
        compilerOptions,
        publicExportNames
      );

      if (diagnostics.length === 0) {
        continue;
      }

      failures.push(
        `${path.relative(rootDir, snippet.filePath)}#${snippet.index}\n${diagnostics.join('\n')}`
      );
    }

    expect(failures).toEqual([]);
  }, 180000);
});
