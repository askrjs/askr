import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vite-plus/test';
import {
  buildInputEntries,
  packageAliasEntries,
} from '../../tooling/platform-contract';

const root = path.resolve(import.meta.dirname, '../..');
const contracts = path.join(root, 'src/compatibility/contracts');

function declarationFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? declarationFiles(file)
      : file.endsWith('.d.ts')
        ? [file]
        : [];
  });
}

it('should resolve published contracts without any implementation declarations', () => {
  const program = ts.createProgram(declarationFiles(contracts), {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    skipLibCheck: true,
  });
  const implementations = program
    .getSourceFiles()
    .map((source) => path.resolve(source.fileName))
    .filter(
      (file) =>
        file.startsWith(path.join(root, 'src') + path.sep) &&
        !file.startsWith(contracts + path.sep)
    );
  expect(implementations).toEqual([]);
});

it('should use the same compatibility entrypoints for packages and source consumer tests', () => {
  const published = buildInputEntries
    .filter(([name]) => name !== 'benchmark')
    .map(([, source]) => source);
  expect(
    published.every((source) => source.startsWith('src/compatibility/entries/'))
  ).toBe(true);
  expect(new Set(packageAliasEntries.map(([, source]) => source))).toEqual(
    new Set(published)
  );
});
