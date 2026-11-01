// @vitest-environment node

import { describe, it, expect } from 'vite-plus/test';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const rootDir = path.resolve(__dirname, '..', '..', '..');
const sourceRoots = [
  path.join(rootDir, 'tests'),
  path.join(rootDir, 'benches'),
];
const htmlTags = new Set([
  'a',
  'abbr',
  'address',
  'article',
  'aside',
  'audio',
  'b',
  'button',
  'canvas',
  'caption',
  'code',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'em',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'img',
  'input',
  'label',
  'li',
  'main',
  'nav',
  'ol',
  'option',
  'p',
  'pre',
  'section',
  'select',
  'small',
  'span',
  'strong',
  'summary',
  'table',
  'tbody',
  'td',
  'textarea',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

function readSourceFiles(dir: string): string[] {
  if (dir.includes(path.join('tests', 'unit', 'dev_checks'))) {
    return [];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readSourceFiles(full));
      continue;
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function unwrap(expr: ts.Expression): ts.Expression {
  let current = expr;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function propertyNameText(
  sourceFile: ts.SourceFile,
  name: ts.PropertyName
): string {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }
  return sourceFile.text.slice(name.getStart(sourceFile), name.getEnd());
}

function isJsxTagExpression(expr: ts.Expression): boolean {
  const unwrapped = unwrap(expr);
  if (ts.isIdentifier(unwrapped)) {
    return true;
  }
  if (ts.isPropertyAccessExpression(unwrapped)) {
    let current: ts.Expression = unwrapped;
    while (ts.isPropertyAccessExpression(current)) {
      current = current.expression;
    }
    return ts.isIdentifier(current);
  }
  return false;
}

function isVNodeObjectLiteral(
  sourceFile: ts.SourceFile,
  node: ts.ObjectLiteralExpression
): boolean {
  let typeProp: ts.PropertyAssignment | null = null;
  let hasChildren = false;
  let hasProps = false;
  let hasKey = false;

  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      continue;
    }
    const name = propertyNameText(sourceFile, prop.name);
    if (name === 'type') {
      typeProp = prop;
    }
    if (name === 'children') {
      hasChildren = true;
    }
    if (name === 'props') {
      hasProps = true;
    }
    if (name === 'key') {
      hasKey = true;
    }
  }

  if (!typeProp) {
    return false;
  }

  const typeExpr = unwrap(typeProp.initializer);
  if (ts.isStringLiteralLike(typeExpr)) {
    return htmlTags.has(typeExpr.text);
  }

  return (
    isJsxTagExpression(typeProp.initializer) &&
    (hasChildren || hasProps || hasKey || node.properties.length === 1)
  );
}

describe('JSX render syntax guidelines', () => {
  it(
    'should keep tests and benches on JSX syntax instead of VNode object literals',
    { timeout: 15000 },
    () => {
      const failures: string[] = [];
      const files = sourceRoots.flatMap((dir) => readSourceFiles(dir));

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        const sourceFile = ts.createSourceFile(
          file,
          content,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX
        );

        let hasJsx = false;

        function visit(node: ts.Node): void {
          if (
            ts.isJsxElement(node) ||
            ts.isJsxSelfClosingElement(node) ||
            ts.isJsxFragment(node)
          ) {
            hasJsx = true;
          }

          if (
            ts.isObjectLiteralExpression(node) &&
            isVNodeObjectLiteral(sourceFile, node)
          ) {
            const line = sourceFile.getLineAndCharacterOfPosition(
              node.getStart(sourceFile)
            ).line;
            failures.push(
              `${path.relative(rootDir, file)}:${line + 1} use JSX syntax instead of VNode object literals`
            );
            return;
          }

          ts.forEachChild(node, visit);
        }

        visit(sourceFile);

        if (file.endsWith('.ts') && hasJsx) {
          failures.push(
            `${path.relative(rootDir, file)}: use the .tsx extension for files that contain JSX`
          );
        }
      }

      expect(failures).toEqual([]);
    }
  );
});
