import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';
import publicApi from './public-api.snapshot.json';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
const obsoleteNames = [
  'defineContext',
  'readContext',
  'ThemeProvider',
  'useTheme',
  'ToastProvider',
  'SidebarProvider',
] as const;

function markdownFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(target);
    return entry.isFile() && entry.name.endsWith('.md') ? [target] : [];
  });
}

describe('React-free public vocabulary', () => {
  it('should expose no hook-shaped or provider-shaped runtime names', () => {
    const exported = Object.values(publicApi).flat();
    expect(exported.filter((name) => /^use[A-Z]/.test(name))).toEqual([]);
    expect(exported.filter((name) => name.endsWith('Provider'))).toEqual([]);
    expect(
      exported.filter((name) => obsoleteNames.includes(name as never))
    ).toEqual([]);
  });

  it('should keep obsolete Askr scope names out of public documentation', () => {
    const violations = markdownFiles(path.join(rootDir, 'docs')).flatMap(
      (file) => {
        const source = fs.readFileSync(file, 'utf8');
        return obsoleteNames
          .filter((name) => source.includes(name))
          .map((name) => `${path.relative(rootDir, file)}: ${name}`);
      }
    );
    expect(violations).toEqual([]);
  });
});
