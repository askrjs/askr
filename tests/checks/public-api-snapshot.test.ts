import fs from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vite-plus/test';
import { declarationContract } from './declaration-contract';

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
  const entrypoints = Object.entries(packageJson.exports)
    .filter(
      ([subpath]) =>
        subpath !== './package.json' && subpath !== './capabilities.json'
    )
    .map(([subpath, conditions]) => {
      const types =
        typeof conditions === 'string' ? conditions : conditions.types;
      if (typeof types !== 'string') return null;
      return [subpath, path.join(rootDir, types)];
    })
    .filter((entry): entry is [string, string] => entry !== null);
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

  return {
    names: snapshot,
    declarations: declarationContract(program, entrypoints, (file) =>
      path.resolve(file).startsWith(path.join(rootDir, 'dist') + path.sep)
    ),
  };
}

describe('public declaration API snapshot', () => {
  const snapshot = generatePublicApiSnapshot();
  it('should match every export-map declaration entrypoint', () => {
    expect(snapshot.names).toEqual(
      JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
    );
  });

  it('should preserve normalized signatures and reachable consumer types', () => {
    expect(snapshot.declarations).toEqual(
      JSON.parse(
        fs.readFileSync(
          path.join(rootDir, 'tests/checks/public-declarations.snapshot.json'),
          'utf8'
        )
      )
    );
  });
});
