#!/usr/bin/env node
/*
 * generate-inventory.js
 *
 * Walks the repository source, public entrypoints, benches, tests, and docs
 * and emits `inventory.md` at repository root.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function toRepoRelative(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join('/');
}

function unique(values) {
  return Array.from(new Set(values));
}

function isTypeScriptFile(filePath) {
  return /\.(ts|tsx|mts|cts)$/.test(filePath);
}

function isMarkdownFile(filePath) {
  return /\.(md|mdx)$/.test(filePath);
}

function readTextFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function walkFiles(rootDir, includeFile) {
  const results = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && includeFile(fullPath)) {
        results.push(fullPath);
      }
    }
  }

  if (fs.existsSync(rootDir)) {
    walk(rootDir);
  }

  return results;
}

function mergeInventories(...inventories) {
  return Object.assign({}, ...inventories);
}

function splitExportSpecifiers(rawSpecifiers) {
  return rawSpecifiers
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^type\s+/, '').trim())
    .map((part) => {
      const aliasParts = part.split(/\s+as\s+/i);
      return (aliasParts[aliasParts.length - 1] || '').trim();
    })
    .filter(Boolean);
}

function extractTypeScriptSymbols(content) {
  const symbols = {
    functions: [],
    classes: [],
    interfaces: [],
    types: [],
    constants: [],
    exports: [],
  };

  let match;

  const funcPattern =
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]+>)?\s*\(/g;
  while ((match = funcPattern.exec(content))) symbols.functions.push(match[1]);

  const classPattern = /(?:export\s+)?class\s+(\w+)/g;
  while ((match = classPattern.exec(content))) symbols.classes.push(match[1]);

  const interfacePattern = /(?:export\s+)?interface\s+(\w+)/g;
  while ((match = interfacePattern.exec(content))) {
    symbols.interfaces.push(match[1]);
  }

  const typePattern = /(?:export\s+)?type\s+(\w+)\s*=/g;
  while ((match = typePattern.exec(content))) symbols.types.push(match[1]);

  const constPattern = /(?:export\s+)?const\s+(\w+)\s*[:=]/g;
  const constMatches = [];
  while ((match = constPattern.exec(content))) constMatches.push(match[1]);

  for (const constName of constMatches) {
    const funcAssign = new RegExp(`const\\s+${constName}\\s*=\\s*\\(`);
    if (!funcAssign.test(content)) symbols.constants.push(constName);
  }

  const exportPattern =
    /export\s+(?:const|function|class|interface|type)\s+(\w+)/g;
  while ((match = exportPattern.exec(content))) symbols.exports.push(match[1]);

  const keywordsToFilter = new Set([
    'if',
    'for',
    'while',
    'do',
    'switch',
    'case',
    'default',
    'try',
    'catch',
    'finally',
    'throw',
    'return',
    'break',
    'continue',
    'new',
    'this',
    'super',
    'extends',
    'implements',
    'import',
    'export',
    'from',
    'as',
    'typeof',
    'instanceof',
    'in',
    'of',
    'let',
    'var',
    'const',
  ]);

  for (const key of Object.keys(symbols)) {
    symbols[key] = unique(symbols[key]).filter(
      (value) => !keywordsToFilter.has(value) && value.length > 1
    );
  }

  return symbols;
}

function extractBenchmarkNames(content) {
  const benchmarks = [];
  let match;

  const benchPattern =
    /\bbench(?:\.(?:skip|only|todo|fails|concurrent|each))?\s*\(\s*(['"`])([^'"`]+)\1/g;
  while ((match = benchPattern.exec(content))) benchmarks.push(match[2]);

  const describePattern =
    /\bdescribe(?:\.(?:skip|only|todo|concurrent|each))?\s*\(\s*(['"`])([^'"`]+)\1/g;
  while ((match = describePattern.exec(content))) benchmarks.push(match[2]);

  return unique(benchmarks);
}

function extractTestBehaviors(content) {
  const behaviors = [];
  let match;

  const testPattern =
    /\b(?:it|test)(?:\.(?:skip|only|todo|fails|concurrent|each))?\s*\(\s*(['"`])([^'"`]+)\1/g;
  while ((match = testPattern.exec(content))) behaviors.push(match[2]);

  return unique(behaviors);
}

function extractPublicApi(content) {
  const api = {
    values: [],
    types: [],
    stars: [],
  };

  let match;

  const namedTypeExports =
    /export\s+type\s*{([\s\S]*?)}\s*from\s*['"][^'"]+['"]/g;
  while ((match = namedTypeExports.exec(content))) {
    api.types.push(...splitExportSpecifiers(match[1]));
  }

  const namedValueExports = /export\s*{([\s\S]*?)}\s*from\s*['"][^'"]+['"]/g;
  while ((match = namedValueExports.exec(content))) {
    api.values.push(...splitExportSpecifiers(match[1]));
  }

  const directValueDecls =
    /export\s+(?:async\s+)?function\s+(\w+)\s*(?:<[^>]+>)?\s*\(|export\s+class\s+(\w+)|export\s+const\s+(\w+)\s*[:=]/g;
  while ((match = directValueDecls.exec(content))) {
    api.values.push(match[1] || match[2] || match[3]);
  }

  const directTypeDecls =
    /export\s+interface\s+(\w+)|export\s+type\s+(\w+)\s*=/g;
  while ((match = directTypeDecls.exec(content))) {
    api.types.push(match[1] || match[2]);
  }

  const starExports = /export\s+\*\s+from\s*['"]([^'"]+)['"]/g;
  while ((match = starExports.exec(content))) {
    api.stars.push(match[1]);
  }

  api.values = unique(api.values.filter(Boolean)).sort();
  api.types = unique(api.types.filter(Boolean)).sort();
  api.stars = unique(api.stars.filter(Boolean)).sort();

  return api;
}

function generateSourceInventoryForDir(rootDir) {
  const inventory = {};

  for (const fullPath of walkFiles(rootDir, isTypeScriptFile)) {
    try {
      const content = readTextFile(fullPath);
      inventory[toRepoRelative(fullPath)] = {
        symbols: extractTypeScriptSymbols(content),
        line_count: content.split(/\r?\n/).length,
        size: content.length,
      };
    } catch (error) {
      console.error('Error processing', fullPath, error);
    }
  }

  return inventory;
}

function generateBenchInventoryForDir(rootDir) {
  const inventory = {};

  for (const fullPath of walkFiles(rootDir, isTypeScriptFile)) {
    try {
      const content = readTextFile(fullPath);
      inventory[toRepoRelative(fullPath)] = {
        benchmarks: extractBenchmarkNames(content),
        line_count: content.split(/\r?\n/).length,
        size: content.length,
      };
    } catch (error) {
      console.error('Error processing', fullPath, error);
    }
  }

  return inventory;
}

function generateTestInventoryForDir(rootDir) {
  const inventory = {};

  for (const fullPath of walkFiles(rootDir, isTypeScriptFile)) {
    try {
      const content = readTextFile(fullPath);
      inventory[toRepoRelative(fullPath)] = {
        behaviors: extractTestBehaviors(content),
        line_count: content.split(/\r?\n/).length,
        size: content.length,
      };
    } catch (error) {
      console.error('Error processing', fullPath, error);
    }
  }

  return inventory;
}

function generateDocsInventory(rootDir) {
  const inventory = {};

  for (const fullPath of walkFiles(rootDir, isMarkdownFile)) {
    inventory[toRepoRelative(fullPath)] = true;
  }

  return inventory;
}

function resolveExportSourceFile(packageRoot, exportTarget) {
  if (typeof exportTarget !== 'string' || !exportTarget.startsWith('./dist/')) {
    return null;
  }

  const stem = exportTarget
    .replace(/^\.\/dist\//, '')
    .replace(/\.d\.ts$/, '')
    .replace(/\.js$/, '');

  const candidates = [
    path.join(packageRoot, 'src', `${stem}.ts`),
    path.join(packageRoot, 'src', `${stem}.tsx`),
    path.join(packageRoot, 'src', `${stem}.mts`),
    path.join(packageRoot, 'src', `${stem}.cts`),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function generatePublicApiInventory(packageJsonPath) {
  const inventory = {};

  if (!fs.existsSync(packageJsonPath)) {
    return inventory;
  }

  const packageRoot = path.dirname(packageJsonPath);
  const pkg = JSON.parse(readTextFile(packageJsonPath));
  const exportsMap =
    pkg.exports && typeof pkg.exports === 'object' ? pkg.exports : {};

  for (const [subpath, exportValue] of Object.entries(exportsMap)) {
    const importTarget =
      exportValue &&
      typeof exportValue === 'object' &&
      !Array.isArray(exportValue)
        ? exportValue.import || exportValue.default || exportValue.types
        : exportValue;

    const sourceFile = resolveExportSourceFile(packageRoot, importTarget);
    if (!sourceFile) {
      continue;
    }

    const api = extractPublicApi(readTextFile(sourceFile));
    inventory[subpath] = {
      source: toRepoRelative(sourceFile),
      values: api.values,
      types: api.types,
      stars: api.stars,
    };
  }

  return inventory;
}

function totalPublicApiSymbols(publicApiInventory) {
  return Object.values(publicApiInventory).reduce(
    (acc, entry) =>
      acc + entry.values.length + entry.types.length + entry.stars.length,
    0
  );
}

function formatIndentedList(lines, items) {
  for (const item of items) {
    lines.push(`  - ${item}`);
  }
}

function generateMarkdownInventory(
  srcInventory,
  publicApiInventory,
  benchInventory,
  testInventory,
  docsInventory
) {
  const lines = [];
  lines.push('# Askr Framework Inventory');
  lines.push('');
  lines.push(`Generated on: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Source files**: ${Object.keys(srcInventory).length}`);
  lines.push(
    `- **Public API entrypoints**: ${Object.keys(publicApiInventory).length}`
  );
  lines.push(`- **Benchmark files**: ${Object.keys(benchInventory).length}`);
  lines.push(`- **Test files**: ${Object.keys(testInventory).length}`);
  lines.push(`- **Docs files**: ${Object.keys(docsInventory).length}`);
  lines.push('');

  const totalSrcSymbols = Object.values(srcInventory).reduce(
    (acc, file) =>
      acc +
      (file.symbols.functions.length || 0) +
      (file.symbols.classes.length || 0) +
      (file.symbols.interfaces.length || 0) +
      (file.symbols.types.length || 0) +
      (file.symbols.constants.length || 0),
    0
  );
  const totalBenchmarks = Object.values(benchInventory).reduce(
    (acc, file) => acc + (file.benchmarks.length || 0),
    0
  );
  const totalBehaviors = Object.values(testInventory).reduce(
    (acc, file) => acc + (file.behaviors.length || 0),
    0
  );

  lines.push(`- **Total symbols in src/**: ${totalSrcSymbols}`);
  lines.push(
    `- **Total public API symbols**: ${totalPublicApiSymbols(publicApiInventory)}`
  );
  lines.push(`- **Total benchmarks**: ${totalBenchmarks}`);
  lines.push(`- **Total test behaviors**: ${totalBehaviors}`);
  lines.push('');

  lines.push('## Public API');
  lines.push('');
  for (const subpath of Object.keys(publicApiInventory).sort()) {
    const entry = publicApiInventory[subpath];
    const summary = [];
    if (entry.values.length) summary.push(`${entry.values.length} values`);
    if (entry.types.length) summary.push(`${entry.types.length} types`);
    if (entry.stars.length) summary.push(`${entry.stars.length} star exports`);
    lines.push(
      `- \`${subpath}\` -> \`${entry.source}\` - ${summary.join(', ') || 'No exports found'}`
    );
    if (entry.values.length) {
      lines.push('  - values:');
      formatIndentedList(lines, entry.values);
    }
    if (entry.types.length) {
      lines.push('  - types:');
      formatIndentedList(lines, entry.types);
    }
    if (entry.stars.length) {
      lines.push('  - star exports:');
      formatIndentedList(
        lines,
        entry.stars.map((value) => `* from ${value}`)
      );
    }
    lines.push('');
  }

  lines.push('## Source Files (`src/`)');
  lines.push('');
  for (const filePath of Object.keys(srcInventory).sort()) {
    const symbols = srcInventory[filePath].symbols;
    const summary = [];
    if (symbols.classes.length)
      summary.push(`${symbols.classes.length} classes`);
    if (symbols.interfaces.length) {
      summary.push(`${symbols.interfaces.length} interfaces`);
    }
    if (symbols.functions.length) {
      summary.push(`${symbols.functions.length} functions`);
    }
    if (symbols.types.length) summary.push(`${symbols.types.length} types`);
    if (symbols.constants.length) {
      summary.push(`${symbols.constants.length} constants`);
    }
    lines.push(
      `- \`${filePath}\` - ${summary.join(', ') || 'No symbols found'}`
    );
  }

  lines.push('');
  lines.push('## Benchmark Files (`benches/`)');
  lines.push('');
  for (const filePath of Object.keys(benchInventory).sort()) {
    const entry = benchInventory[filePath];
    lines.push(`- \`${filePath}\` - ${entry.benchmarks.length} benchmarks`);
    if (entry.benchmarks.length) {
      formatIndentedList(lines, entry.benchmarks.slice().sort());
    }
    lines.push('');
  }

  lines.push('## Test Files (`tests/`)');
  lines.push('');
  for (const filePath of Object.keys(testInventory).sort()) {
    const entry = testInventory[filePath];
    lines.push(`- \`${filePath}\` - ${entry.behaviors.length} test behaviors`);
    if (entry.behaviors.length) {
      formatIndentedList(lines, entry.behaviors.slice().sort());
    }
    lines.push('');
  }

  lines.push('## Docs Files (`docs/`)');
  lines.push('');
  for (const filePath of Object.keys(docsInventory).sort()) {
    lines.push(`- \`${filePath}\``);
  }

  return lines.join('\n');
}

function main() {
  console.log('Generating Askr monorepo inventory...');

  const sourceParts = [];
  const benchParts = [];
  const testParts = [];
  const publicApiParts = [
    generatePublicApiInventory(path.join(repoRoot, 'package.json')),
  ];

  const rootSrcDir = path.join(repoRoot, 'src');
  const rootBenchDir = path.join(repoRoot, 'benches');
  const rootTestsDir = path.join(repoRoot, 'tests');

  if (fs.existsSync(rootSrcDir)) {
    sourceParts.push(generateSourceInventoryForDir(rootSrcDir));
  }
  if (fs.existsSync(rootBenchDir)) {
    benchParts.push(generateBenchInventoryForDir(rootBenchDir));
  }
  if (fs.existsSync(rootTestsDir)) {
    testParts.push(generateTestInventoryForDir(rootTestsDir));
  }

  const packagesDir = path.join(repoRoot, 'packages');
  const packageNames = fs.existsSync(packagesDir)
    ? fs
        .readdirSync(packagesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];

  for (const packageName of packageNames) {
    const packageRoot = path.join(packagesDir, packageName);
    const packageJsonPath = path.join(packageRoot, 'package.json');
    const packageSrcDir = path.join(packageRoot, 'src');
    const packageBenchDir = path.join(packageRoot, 'benches');
    const packageTestsDir = path.join(packageRoot, 'tests');

    if (fs.existsSync(packageSrcDir)) {
      sourceParts.push(generateSourceInventoryForDir(packageSrcDir));
    }
    if (fs.existsSync(packageBenchDir)) {
      benchParts.push(generateBenchInventoryForDir(packageBenchDir));
    }
    if (fs.existsSync(packageTestsDir)) {
      testParts.push(generateTestInventoryForDir(packageTestsDir));
    }
    if (fs.existsSync(packageJsonPath)) {
      publicApiParts.push(generatePublicApiInventory(packageJsonPath));
    }
  }

  const srcInventory = mergeInventories(...sourceParts);
  const publicApiInventory = mergeInventories(...publicApiParts);
  const benchInventory = mergeInventories(...benchParts);
  const testInventory = mergeInventories(...testParts);
  const docsInventory = fs.existsSync(path.join(repoRoot, 'docs'))
    ? generateDocsInventory(path.join(repoRoot, 'docs'))
    : {};

  const markdown = generateMarkdownInventory(
    srcInventory,
    publicApiInventory,
    benchInventory,
    testInventory,
    docsInventory
  );
  const outputFile = path.join(repoRoot, 'inventory.md');
  fs.writeFileSync(outputFile, markdown, 'utf8');

  console.log(`Inventory generated: ${outputFile}`);
  console.log('\nSummary:');
  console.log(`  Source files: ${Object.keys(srcInventory).length}`);
  console.log(
    `  Public API entrypoints: ${Object.keys(publicApiInventory).length}`
  );
  console.log(`  Benchmark files: ${Object.keys(benchInventory).length}`);
  console.log(`  Test files: ${Object.keys(testInventory).length}`);
  console.log(`  Docs files: ${Object.keys(docsInventory).length}`);

  const totalSrcSymbols = Object.values(srcInventory).reduce(
    (acc, file) =>
      acc +
      (file.symbols.functions.length || 0) +
      (file.symbols.classes.length || 0) +
      (file.symbols.interfaces.length || 0) +
      (file.symbols.types.length || 0) +
      (file.symbols.constants.length || 0),
    0
  );
  const totalBenchmarks = Object.values(benchInventory).reduce(
    (acc, file) => acc + (file.benchmarks.length || 0),
    0
  );
  const totalBehaviors = Object.values(testInventory).reduce(
    (acc, file) => acc + (file.behaviors.length || 0),
    0
  );

  console.log(`  Total symbols in src/**: ${totalSrcSymbols}`);
  console.log(
    `  Total public API symbols: ${totalPublicApiSymbols(publicApiInventory)}`
  );
  console.log(`  Total benchmarks: ${totalBenchmarks}`);
  console.log(`  Total test behaviors: ${totalBehaviors}`);
}

if (process.argv[1] && process.argv[1].endsWith('generate-inventory.js')) {
  main();
}
