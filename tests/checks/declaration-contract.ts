import ts from 'typescript';

/** Follow the declarations exposed by consumers, including unnamed subpath types. */
export function declarationContract(
  program: ts.Program,
  entrypoints: ReadonlyArray<readonly [string, string]>,
  ownsFile: (file: string) => boolean
) {
  const checker = program.getTypeChecker();
  const printer = ts.createPrinter({
    removeComments: true,
    newLine: ts.NewLineKind.LineFeed,
  });
  const reachable = new Map<string, Set<string>>();
  const visited = new Set<ts.Symbol>();
  const labels = new Map<ts.Symbol, string>();
  const usedLabels = new Set<string>();
  const exports: Record<string, Record<string, string[]>> = {};

  function label(symbol: ts.Symbol): string {
    const existing = labels.get(symbol);
    if (existing) return existing;
    const name = symbol.getName();
    let result = name;
    let suffix = 2;
    while (usedLabels.has(result)) result = `${name}$${suffix++}`;
    labels.set(symbol, result);
    usedLabels.add(result);
    return result;
  }

  const resolve = (symbol: ts.Symbol): ts.Symbol => {
    const seen = new Set<ts.Symbol>();
    while (!seen.has(symbol)) {
      seen.add(symbol);
      if (symbol.flags & ts.SymbolFlags.Alias) {
        symbol = checker.getAliasedSymbol(symbol);
        continue;
      }
      // A public value ascribed with `typeof Contract.fn` has precisely the
      // referenced overloads or constructor. Compare that contract rather than
      // the location of its implementation alias.
      const value = symbol.declarations?.find(ts.isVariableDeclaration);
      if (value?.type && ts.isTypeQueryNode(value.type)) {
        const target = checker.getSymbolAtLocation(value.type.exprName);
        if (target) {
          symbol = target;
          continue;
        }
      }
      break;
    }
    return symbol;
  };
  const declarations = (symbol: ts.Symbol) =>
    (symbol.declarations ?? []).filter(
      (node) =>
        ownsFile(node.getSourceFile().fileName) &&
        (ts.isFunctionDeclaration(node) ||
          ts.isClassDeclaration(node) ||
          ts.isInterfaceDeclaration(node) ||
          ts.isTypeAliasDeclaration(node) ||
          ts.isEnumDeclaration(node) ||
          ts.isModuleDeclaration(node) ||
          ts.isVariableDeclaration(node))
    );

  function capture(symbol: ts.Symbol): string[] {
    symbol = resolve(symbol);
    const name = label(symbol);
    const nodes = declarations(symbol);
    if (visited.has(symbol)) return [];
    visited.add(symbol);
    const signatures = nodes.map((declaration) => {
      const result = ts.transform(declaration, [
        (context) => {
          const visit: ts.Visitor = (node) => {
            if (ts.isStringLiteral(node)) {
              return ts.factory.createStringLiteral(node.text);
            }
            if (ts.isObjectBindingPattern(node)) {
              // A formatter's trailing comma is not an argument contract.
              return ts.factory.createObjectBindingPattern(
                node.elements.map(
                  (element) => ts.visitNode(element, visit) as ts.BindingElement
                )
              );
            }
            // Private implementation details are not consumer declarations.
            if (
              (ts.canHaveModifiers(node) &&
                ts
                  .getModifiers(node)
                  ?.some(
                    (modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword
                  )) ||
              (ts.isPropertyDeclaration(node) &&
                ts.isPrivateIdentifier(node.name))
            )
              return undefined;
            if (ts.isIdentifier(node)) {
              const reference = checker.getSymbolAtLocation(node);
              if (reference) {
                const target = resolve(reference);
                if (declarations(target).length > 0) {
                  capture(target);
                  // Bundled imports use generated aliases. Compare the original
                  // declaration names, never output chunk names or import letters.
                  return ts.factory.createIdentifier(label(target));
                }
              }
            }
            return ts.visitEachChild(node, visit, context);
          };
          return (node) => ts.visitNode(node, visit) as typeof node;
        },
      ]);
      try {
        return printer
          .printNode(
            ts.EmitHint.Unspecified,
            result.transformed[0]!,
            declaration.getSourceFile()
          )
          .trim();
      } finally {
        result.dispose();
      }
    });
    if (signatures.length) {
      const set = reachable.get(name) ?? new Set<string>();
      for (const signature of signatures) set.add(signature);
      reachable.set(name, set);
    }
    return signatures;
  }

  for (const [subpath, file] of entrypoints) {
    const source = program.getSourceFile(file);
    const module = source && checker.getSymbolAtLocation(source);
    if (!module) throw new Error(`Missing declaration module: ${subpath}`);
    const entries: Record<string, string[]> = {};
    for (const symbol of checker
      .getExportsOfModule(module)
      .sort((left, right) =>
        left.getName().localeCompare(right.getName(), 'en')
      )) {
      const target = resolve(symbol);
      // Capture separately to retain the mapping even for re-exported symbols.
      visited.delete(target);
      entries[symbol.getName()] = capture(target);
    }
    exports[subpath] = entries;
  }
  return {
    exports,
    reachable: Object.fromEntries(
      [...reachable]
        .sort(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([name, signatures]) => [name, [...signatures].sort()])
    ),
  };
}
