import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vite-plus/test';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
const snapshotPath = path.join(
  rootDir,
  'tests',
  'checks',
  'public-api.snapshot.json'
);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
);

function generatePublicApiSnapshot() {
  const entrypoints = Object.entries(packageJson.exports).map(
    ([subpath, conditions]) => {
      const types =
        typeof conditions === 'string' ? conditions : conditions.types;
      if (typeof types !== 'string') {
        throw new Error(`Missing declaration target for ${subpath}`);
      }
      return [subpath, path.join(rootDir, types)];
    }
  );
  const files = entrypoints.map(([, file]) => file);
  const missing = files.filter((file) => !fs.existsSync(file));
  if (missing.length > 0) {
    execSync('npm run build', { cwd: rootDir, stdio: 'ignore' });
    const present = files.every((file) => fs.existsSync(file));
    if (!present) {
      throw new Error(
        `Build declarations before snapshotting: ${files
          .filter((file) => !fs.existsSync(file))
          .join(', ')}`
      );
    }
  }

  const program = ts.createProgram(files, {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const snapshot: Record<string, string[]> = {};

  for (const [subpath, file] of entrypoints) {
    const source = program.getSourceFile(file);
    const moduleSymbol = source && checker.getSymbolAtLocation(source);
    if (!moduleSymbol) {
      throw new Error(`Unable to read declarations for ${subpath}`);
    }
    snapshot[subpath] = checker
      .getExportsOfModule(moduleSymbol)
      .map((symbol) => symbol.getName())
      .sort();
  }

  return snapshot;
}

describe('public declaration API snapshot', () => {
  it('should match every export-map declaration entrypoint', () => {
    expect(generatePublicApiSnapshot()).toEqual(
      JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
    );
  });
});
