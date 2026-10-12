import ts from '@typescript/typescript6';

export interface ExportInventory {
  packages: { name: string; repo: string }[];
  exportMapDecisions: {
    package: number;
    key: string;
    decision: string;
    baselineTarget?: unknown;
    candidateTarget?: unknown;
  }[];
  absentBaselineSymbols: [number, string, string, string, number[]][];
  withdrawnCandidateSymbols?: [number, string, string, string, number[]][];
}

export interface Hit {
  path: string;
  line: number;
  module: string;
  name: string | null;
  kind: string;
  reason: string;
  context: string;
}

/** The frozen sweep's syntax boundary: literals, namespaces, fences and generators. */
export function scanText(
  file: string,
  text: string,
  inventory: ExportInventory
): { checks: number; hits: Hit[] } {
  let checks = 0;
  const hits: Hit[] = [];
  if (!text.includes('@askrjs/')) return { checks, hits };
  const packages = inventory.packages.map((p) => p.name);
  const knownPackage = (module: string) =>
    packages.find((p) => module === p || module.startsWith(p + '/'));
  const removed = new Set(
    [
      ...inventory.absentBaselineSymbols,
      ...(inventory.withdrawnCandidateSymbols ?? []),
    ].map(
      ([pkg, key, name]) =>
        inventory.packages[pkg]!.name +
        (key === '.' ? '' : key.slice(1)) +
        '\0' +
        name
    )
  );
  const hasPath = (module: string) => {
    const pkg = knownPackage(module);
    if (!pkg) return true;
    const key = module === pkg ? '.' : '.' + module.slice(pkg.length);
    return inventory.exportMapDecisions.some((entry) => {
      if (
        inventory.packages[entry.package]!.name !== pkg ||
        entry.decision !== 'KEEP'
      )
        return false;
      if (!entry.key.includes('*')) return entry.key === key;
      const [before, after] = entry.key.split('*');
      return key.startsWith(before!) && key.endsWith(after!);
    });
  };
  if (file.endsWith('.md')) {
    let fence = false;
    text = text
      .split('\n')
      .map((line) => {
        if (/^\s*```/.test(line)) {
          fence = !fence;
          return '';
        }
        return fence ? line : '';
      })
      .join('\n');
  }
  const lines = text.split('\n');
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const namespaces = new Map<string, string>();
  const record = (
    line: number,
    module: string,
    name: string | null,
    kind: string
  ) => {
    checks++;
    const reason = !hasPath(module)
      ? 'removed-path'
      : name && removed.has(module + '\0' + name)
        ? 'removed-name'
        : null;
    if (reason)
      hits.push({
        path: file,
        line,
        module,
        name,
        kind,
        reason,
        context: lines.slice(Math.max(0, line - 3), line + 2).join('\n'),
      });
  };
  const lineOf = (node: ts.Node, tree = source) =>
    tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
  function imports(
    node: ts.Node,
    tree: ts.SourceFile,
    prefix = '',
    offset = 0
  ): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const module = node.moduleSpecifier.text;
      if (knownPackage(module)) {
        record(offset + lineOf(node, tree), module, null, prefix + 'module');
        const clause = ts.isImportDeclaration(node)
          ? node.importClause
          : undefined;
        if (clause?.name)
          record(
            offset + lineOf(node, tree),
            module,
            'default',
            prefix + 'default'
          );
        const bindings =
          clause?.namedBindings ||
          (ts.isExportDeclaration(node) ? node.exportClause : undefined);
        if (
          bindings &&
          (ts.isNamedImports(bindings) || ts.isNamedExports(bindings))
        )
          for (const item of bindings.elements)
            record(
              offset + lineOf(item, tree),
              module,
              (item.propertyName || item.name).text,
              prefix + 'named'
            );
        if (!prefix && bindings && ts.isNamespaceImport(bindings))
          namespaces.set(bindings.name.text, module);
      }
    }
    if (
      !prefix &&
      ts.isCallExpression(node) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === 'require'))
    )
      record(lineOf(node), node.arguments[0].text, null, 'dynamic');
    ts.forEachChild(node, (child) => imports(child, tree, prefix, offset));
  }
  imports(source, source);
  function namespaceVisit(node: ts.Node): void {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      namespaces.has(node.expression.text)
    )
      record(
        lineOf(node),
        namespaces.get(node.expression.text)!,
        node.name.text,
        'namespace-member'
      );
    ts.forEachChild(node, namespaceVisit);
  }
  namespaceVisit(source);
  function generatedVisit(node: ts.Node): void {
    let embedded: string | null = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      embedded = node.text;
    if (ts.isTemplateExpression(node))
      embedded =
        node.head.text +
        node.templateSpans
          .map((span) => '__ASKR_EXPRESSION__' + span.literal.text)
          .join('');
    if (
      embedded &&
      embedded.includes('@askrjs/') &&
      /\b(?:import|export)\b/.test(embedded)
    ) {
      const parsed = ts.createSourceFile(
        file + '.generated.tsx',
        embedded,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );
      imports(parsed, parsed, 'generated-', lineOf(node) - 1);
    }
    ts.forEachChild(node, generatedVisit);
  }
  generatedVisit(source);
  return { checks, hits };
}
