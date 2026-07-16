import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import ts from 'typescript';
import { describe, expect, it } from 'vite-plus/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..', '..');
const docsRoots = [path.join(rootDir, 'docs'), path.join(rootDir, 'README.md')];
const exampleRoots = [path.join(rootDir, 'examples')];
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

type HtmlSnippet = {
  filePath: string;
  index: number;
  code: string;
};

function normalizeSnippetLang(lang: string): Snippet['lang'] | 'html' | null {
  const normalized = lang.toLowerCase();

  if (normalized === 'typescript') {
    return 'ts';
  }

  if (normalized === 'javascript') {
    return 'js';
  }

  if (
    normalized === 'ts' ||
    normalized === 'tsx' ||
    normalized === 'js' ||
    normalized === 'jsx' ||
    normalized === 'html'
  ) {
    return normalized;
  }

  return null;
}

function normalizeVirtualPath(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, '/');
}

function snippetUsesJsx(code: string): boolean {
  return /<\/?[A-Za-z][\w:-]*(?:\s[^>]*)?>/.test(code);
}

function getSnippetVirtualExtension(snippet: Snippet): Snippet['lang'] {
  if (snippet.lang === 'tsx' || snippet.lang === 'jsx') {
    return snippet.lang;
  }

  if (snippetUsesJsx(snippet.code)) {
    return snippet.lang === 'js' ? 'jsx' : 'tsx';
  }

  return snippet.lang;
}

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

function isPublishedDocsFile(filePath: string): boolean {
  const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
  return (
    relativePath === 'README.md' ||
    (relativePath.startsWith('docs/') &&
      !relativePath.startsWith('docs/internals/') &&
      !relativePath.startsWith('docs/development/'))
  );
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

function extractCodeSnippets(filePath: string): Snippet[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const snippets: Snippet[] = [];
  const fencePattern = /```([A-Za-z0-9_-]+)[^\n]*\n([\s\S]*?)```/g;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(content)) !== null) {
    const lang = normalizeSnippetLang(match[1]);
    if (
      !lang ||
      (lang !== 'ts' && lang !== 'tsx' && lang !== 'js' && lang !== 'jsx')
    ) {
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

function extractPublicTypecheckedSnippets(filePath: string): Snippet[] {
  return extractCodeSnippets(filePath);
}

function extractSyntaxCheckedSnippets(filePath: string): Snippet[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const snippets: Snippet[] = [];
  const fencePattern = /```([A-Za-z0-9_-]+)[^\n]*\n([\s\S]*?)```/g;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(content)) !== null) {
    const lang = normalizeSnippetLang(match[1]);
    if (
      !lang ||
      (lang !== 'ts' && lang !== 'tsx' && lang !== 'js' && lang !== 'jsx')
    ) {
      continue;
    }

    const code = match[2].trim();
    if (/\[\s*\.\.\.\s*\]/.test(code) || /\{\s*\.\.\.\s*\}/.test(code)) {
      continue;
    }

    index += 1;
    snippets.push({
      filePath,
      index,
      lang,
      code,
    });
  }

  return snippets;
}

function extractHtmlSnippets(filePath: string): HtmlSnippet[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const snippets: HtmlSnippet[] = [];
  const fencePattern = /```([A-Za-z0-9_-]+)[^\n]*\n([\s\S]*?)```/g;
  let index = 0;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(content)) !== null) {
    const lang = normalizeSnippetLang(match[1]);
    if (lang !== 'html') {
      continue;
    }

    index += 1;
    snippets.push({
      filePath,
      index,
      code: match[2].trim(),
    });
  }

  return snippets;
}

function extractSourceExamples(filePath: string): Snippet[] {
  const lang = path.extname(filePath).slice(1).toLowerCase();
  if (lang !== 'ts' && lang !== 'tsx' && lang !== 'js' && lang !== 'jsx') {
    return [];
  }

  const code = fs.readFileSync(filePath, 'utf8');
  if (!/@askrjs\/askr(?:\/[A-Za-z0-9/_-]+)?/.test(code)) {
    return [];
  }

  return [
    {
      filePath,
      index: 1,
      lang,
      code: code.trim(),
    },
  ];
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

  const publishedPaths = Object.fromEntries(
    Object.entries(parsed.options.paths ?? {}).map(([specifier, targets]) => [
      specifier,
      targets.map((target) =>
        target.replace(/\.\/\.\/src\/(.*)\.(?:tsx?|jsx?)$/, './dist/$1.d.ts')
      ),
    ])
  );

  return {
    ...parsed.options,
    paths: publishedPaths,
    allowJs: true,
    checkJs: true,
    composite: false,
    declaration: false,
    declarationMap: false,
    incremental: false,
    noEmit: true,
    tsBuildInfoFile: undefined,
  };
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

function isMissingRelativeModuleDiagnostic(diagnostic: ts.Diagnostic): boolean {
  if (diagnostic.code !== 2307) {
    return false;
  }

  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  return /Cannot find module '(\.\/|\.\.\/)/.test(message);
}

function compileSnippets(
  snippets: Snippet[],
  options: ts.CompilerOptions,
  publicExportNames: Set<string>
): Map<string, string[]> {
  const entries = snippets.map((snippet) => {
    const virtualExtension = getSnippetVirtualExtension(snippet);
    const snippetPath = normalizeVirtualPath(
      path.join(
        rootDir,
        '__snippet_checks__',
        `${path.basename(snippet.filePath).replace(/[^\w.-]/g, '_')}.${snippet.index}.${virtualExtension}`
      )
    );

    return {
      snippet,
      snippetPath,
      ambientPath: `${snippetPath}.globals.d.ts`,
      stubbedNames: new Set<string>(),
    };
  });
  const sourceFiles = new Map<string, string>();
  const results = new Map<string, string[]>();

  for (let pass = 0; pass < 5; pass += 1) {
    sourceFiles.clear();
    for (const entry of entries) {
      sourceFiles.set(entry.snippetPath, `${entry.snippet.code}\n`);
      sourceFiles.set(
        entry.ambientPath,
        [
          'type __AskrSnippetStub = any;',
          '',
          ...[...entry.stubbedNames]
            .sort()
            .map(
              (name) =>
                `type ${name} = __AskrSnippetStub;\ndeclare const ${name}: __AskrSnippetStub;\n`
            ),
        ].join('\n')
      );
    }

    const host = ts.createCompilerHost(options, true);
    const originalGetSourceFile = host.getSourceFile.bind(host);
    const originalReadFile = host.readFile.bind(host);
    const originalFileExists = host.fileExists.bind(host);

    host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
      const virtualPath = normalizeVirtualPath(fileName);
      const virtualSource = sourceFiles.get(virtualPath);
      if (virtualSource !== undefined) {
        return ts.createSourceFile(
          virtualPath,
          virtualSource,
          languageVersion,
          true,
          virtualPath.endsWith('.tsx')
            ? ts.ScriptKind.TSX
            : virtualPath.endsWith('.jsx')
              ? ts.ScriptKind.JSX
              : virtualPath.endsWith('.js')
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
      const virtualSource = sourceFiles.get(normalizeVirtualPath(fileName));
      if (virtualSource !== undefined) {
        return virtualSource;
      }

      return originalReadFile(fileName);
    };

    host.fileExists = (fileName) => {
      if (sourceFiles.has(normalizeVirtualPath(fileName))) {
        return true;
      }

      return originalFileExists(fileName);
    };

    const program = ts.createProgram({
      rootNames: entries.flatMap(({ snippetPath, ambientPath }) => [
        snippetPath,
        ambientPath,
      ]),
      options,
      host,
    });
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter((diagnostic) => !isMissingRelativeModuleDiagnostic(diagnostic))
      .filter((diagnostic) => diagnostic.file !== undefined);

    let addedStub = false;
    for (const entry of entries) {
      const snippetDiagnostics = diagnostics.filter(
        (diagnostic) =>
          normalizeVirtualPath(diagnostic.file!.fileName) === entry.snippetPath
      );
      results.set(entry.snippetPath, snippetDiagnostics.map(formatDiagnostic));

      for (const diagnostic of snippetDiagnostics) {
        const missingName = getMissingName(diagnostic);
        if (
          !missingName ||
          entry.stubbedNames.has(missingName) ||
          publicExportNames.has(missingName)
        ) {
          continue;
        }

        entry.stubbedNames.add(missingName);
        addedStub = true;
      }
    }

    if (!addedStub) {
      return results;
    }
  }

  for (const entry of entries) {
    if (entry.stubbedNames.size > 0) {
      results.set(entry.snippetPath, [
        `${path.relative(rootDir, entry.snippet.filePath)}#${entry.snippet.index} exceeded missing-name stub passes.`,
      ]);
    }
  }

  return results;
}

function syntaxCheckSnippet(snippet: Snippet): string[] {
  const virtualExtension = getSnippetVirtualExtension(snippet);
  const virtualPath = `${normalizeVirtualPath(
    path.join(
      rootDir,
      '__snippet_checks__',
      `${path.basename(snippet.filePath).replace(/[^\w.-]/g, '_')}.${snippet.index}.syntax.${virtualExtension}`
    )
  )}`;
  const wrappedCode = /(^|\n)\s*(import|export)\b/.test(snippet.code)
    ? `${snippet.code}\n`
    : `async function __askrDocSnippet() {\n${snippet.code}\n}\n`;
  const source = ts.createSourceFile(
    virtualPath,
    wrappedCode,
    ts.ScriptTarget.Latest,
    true,
    virtualExtension === 'tsx'
      ? ts.ScriptKind.TSX
      : virtualExtension === 'jsx'
        ? ts.ScriptKind.JSX
        : virtualExtension === 'js'
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS
  );

  return source.parseDiagnostics.map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  );
}

function syntaxCheckHtmlSnippet(snippet: HtmlSnippet): string[] {
  try {
    new JSDOM(`<root>${snippet.code}</root>`, {
      contentType: 'application/xhtml+xml',
    });
    return [];
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown HTML parse error.';
    return [message.split('\n')[0]];
  }
}

describe('public docs snippets', () => {
  it('should compile published docs snippets that import public Askr entrypoints', () => {
    const snippets = docsRoots
      .flatMap((entry) =>
        collectFiles(entry)
          .filter((filePath) => /\.(md|mdx)$/.test(filePath))
          .filter((filePath) => isPublishedDocsFile(filePath))
          .flatMap((filePath) => extractPublicTypecheckedSnippets(filePath))
      )
      .concat(
        exampleRoots.flatMap((entry) =>
          collectFiles(entry).flatMap((filePath) =>
            extractSourceExamples(filePath)
          )
        )
      );

    expect(snippets.length).toBeGreaterThan(0);

    const compilerOptions = loadCompilerOptions();
    const publicExportNames = collectPublicExportNames();
    const failures: string[] = [];
    const diagnosticsBySnippet = compileSnippets(
      snippets,
      compilerOptions,
      publicExportNames
    );

    for (const snippet of snippets) {
      const snippetPath = normalizeVirtualPath(
        path.join(
          rootDir,
          '__snippet_checks__',
          `${path.basename(snippet.filePath).replace(/[^\w.-]/g, '_')}.${snippet.index}.${getSnippetVirtualExtension(snippet)}`
        )
      );
      const diagnostics = diagnosticsBySnippet.get(snippetPath) ?? [];

      if (diagnostics.length === 0) {
        continue;
      }

      failures.push(
        `${path.relative(rootDir, snippet.filePath)}#${snippet.index}\n${diagnostics.join('\n')}`
      );
    }

    expect(failures).toEqual([]);
  }, 180000);

  it('should keep published user-facing TS and TSX docs snippets syntactically valid', () => {
    const snippets = docsRoots.flatMap((entry) =>
      collectFiles(entry)
        .filter((filePath) => /\.(md|mdx)$/.test(filePath))
        .filter((filePath) => isPublishedDocsFile(filePath))
        .flatMap((filePath) => extractSyntaxCheckedSnippets(filePath))
    );

    expect(snippets.length).toBeGreaterThan(0);

    const failures: string[] = [];

    for (const snippet of snippets) {
      const diagnostics = syntaxCheckSnippet(snippet);
      if (diagnostics.length === 0) {
        continue;
      }

      failures.push(
        `${path.relative(rootDir, snippet.filePath)}#${snippet.index}\n${diagnostics.join('\n')}`
      );
    }

    expect(failures).toEqual([]);
  });

  it('should keep published user-facing HTML docs snippets well-formed', () => {
    const snippets = docsRoots.flatMap((entry) =>
      collectFiles(entry)
        .filter((filePath) => /\.(md|mdx)$/.test(filePath))
        .filter((filePath) => isPublishedDocsFile(filePath))
        .flatMap((filePath) => extractHtmlSnippets(filePath))
    );

    expect(snippets.length).toBeGreaterThan(0);

    const failures: string[] = [];

    for (const snippet of snippets) {
      const diagnostics = syntaxCheckHtmlSnippet(snippet);
      if (diagnostics.length === 0) {
        continue;
      }

      failures.push(
        `${path.relative(rootDir, snippet.filePath)}#${snippet.index}\n${diagnostics.join('\n')}`
      );
    }

    expect(failures).toEqual([]);
  });
});
