import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
);

export function generatePublicApiSnapshot() {
  const entrypoints = Object.entries(packageJson.exports).map(
    ([subpath, conditions]) => {
      const types = conditions.types;
      if (typeof types !== 'string') {
        throw new Error(`Missing declaration target for ${subpath}`);
      }
      return [subpath, path.join(rootDir, types)];
    }
  );
  const files = entrypoints.map(([, file]) => file);
  const missing = files.filter((file) => !fs.existsSync(file));
  if (missing.length > 0) {
    throw new Error(
      `Build declarations before snapshotting: ${missing.join(', ')}`
    );
  }

  const program = ts.createProgram(files, {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const snapshot = {};

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

const output = `${JSON.stringify(generatePublicApiSnapshot(), null, 2)}\n`;
if (process.argv.includes('--write')) {
  fs.writeFileSync(
    path.join(rootDir, 'tests', 'checks', 'public-api.snapshot.json'),
    output
  );
} else {
  process.stdout.write(output);
}
