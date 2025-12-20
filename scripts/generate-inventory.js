#!/usr/bin/env node
/*
 * generate-inventory.js
 *
 * Port of the Python inventory generator to an ESM Node script.
 * Walks src/, benches/, and tests/ to build a concise inventory
 * and emits `inventory.md` at repository root.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function unique(arr) {
  return Array.from(new Set(arr));
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

  const funcPattern = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g;
  let m;
  while ((m = funcPattern.exec(content))) symbols.functions.push(m[1]);

  const classPattern = /(?:export\s+)?class\s+(\w+)/g;
  while ((m = classPattern.exec(content))) symbols.classes.push(m[1]);

  const interfacePattern = /(?:export\s+)?interface\s+(\w+)/g;
  while ((m = interfacePattern.exec(content))) symbols.interfaces.push(m[1]);

  const typePattern = /(?:export\s+)?type\s+(\w+)\s*=/g;
  while ((m = typePattern.exec(content))) symbols.types.push(m[1]);

  const constPattern = /(?:export\s+)?const\s+(\w+)\s*[:=]/g;
  const constMatches = [];
  while ((m = constPattern.exec(content))) constMatches.push(m[1]);

  for (const match of constMatches) {
    // Skip if it's followed by a function-style assignment like: const x = (
    const funcAssign = new RegExp(`const\\s+${match}\\s*=\\s*\\(`);
    if (!funcAssign.test(content)) symbols.constants.push(match);
  }

  const exportPattern =
    /export\s+(?:const|function|class|interface|type)\s+(\w+)/g;
  while ((m = exportPattern.exec(content))) symbols.exports.push(m[1]);

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
      (s) => !keywordsToFilter.has(s) && s.length > 1
    );
  }

  return symbols;
}

function extractBenchmarkNames(content) {
  const benches = [];
  const benchPattern = /bench\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = benchPattern.exec(content))) benches.push(m[1]);

  const describePattern = /describe\(\s*['"]([^'"]+)['"]/g;
  while ((m = describePattern.exec(content))) benches.push(m[1]);

  return unique(benches);
}

function extractTestBehaviors(content) {
  const behaviors = [];
  const testPattern = /(?:it|test)\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = testPattern.exec(content))) behaviors.push(m[1]);
  return unique(behaviors);
}

function generateSrcInventory(srcDir) {
  const inventory = {};
  const patterns = ['.ts', '.tsx'];

  for (const ext of patterns) {
    const glob = `**/*${ext}`; // not using glob lib, we'll walk manually
  }

  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (
        ent.isFile() &&
        (full.endsWith('.ts') || full.endsWith('.tsx'))
      ) {
        try {
          const content = fs.readFileSync(full, 'utf8');
          const relativePath = path.relative(repoRoot, full);
          const symbols = extractTypeScriptSymbols(content);
          inventory[relativePath] = {
            symbols,
            line_count: content.split(/\r?\n/).length,
            size: content.length,
          };
        } catch (e) {
          console.error('Error processing', full, e);
        }
      }
    }
  }

  walk(srcDir);
  return inventory;
}

function generateBenchesInventory(benchesDir) {
  const inventory = {};
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && full.endsWith('.ts')) {
        try {
          const content = fs.readFileSync(full, 'utf8');
          const relativePath = path.relative(repoRoot, full);
          const benchmarks = extractBenchmarkNames(content);
          inventory[relativePath] = {
            benchmarks,
            line_count: content.split(/\r?\n/).length,
            size: content.length,
          };
        } catch (e) {
          console.error('Error processing', full, e);
        }
      }
    }
  }
  walk(benchesDir);
  return inventory;
}

function generateTestsInventory(testsDir) {
  const inventory = {};
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (
        ent.isFile() &&
        (full.endsWith('.ts') || full.endsWith('.tsx'))
      ) {
        try {
          const content = fs.readFileSync(full, 'utf8');
          const relativePath = path.relative(repoRoot, full);
          const behaviors = extractTestBehaviors(content);
          inventory[relativePath] = {
            behaviors,
            line_count: content.split(/\r?\n/).length,
            size: content.length,
          };
        } catch (e) {
          console.error('Error processing', full, e);
        }
      }
    }
  }
  walk(testsDir);
  return inventory;
}

function generateMarkdownInventory(
  srcInventory,
  benchesInventory,
  testsInventory
) {
  const lines = [];
  lines.push('# Askr Framework Inventory');
  lines.push('');
  lines.push(`Generated on: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Source files**: ${Object.keys(srcInventory).length}`);
  lines.push(`- **Benchmark files**: ${Object.keys(benchesInventory).length}`);
  lines.push(`- **Test files**: ${Object.keys(testsInventory).length}`);
  lines.push('');

  const totalSrcSymbols = Object.values(srcInventory).reduce((acc, file) => {
    return (
      acc +
      (file.symbols.functions.length || 0) +
      (file.symbols.classes.length || 0) +
      (file.symbols.interfaces.length || 0)
    );
  }, 0);
  const totalBenchmarks = Object.values(benchesInventory).reduce(
    (acc, f) => acc + (f.benchmarks.length || 0),
    0
  );
  const totalBehaviors = Object.values(testsInventory).reduce(
    (acc, f) => acc + (f.behaviors.length || 0),
    0
  );

  lines.push(`- **Total symbols in src/**: ${totalSrcSymbols}`);
  lines.push(`- **Total benchmarks**: ${totalBenchmarks}`);
  lines.push(`- **Total test behaviors**: ${totalBehaviors}`);
  lines.push('');

  lines.push('## Source Files (`src/`)');
  lines.push('');

  for (const filePath of Object.keys(srcInventory).sort()) {
    const data = srcInventory[filePath];
    const symbols = data.symbols;
    const symbolCounts = [];
    if (symbols.classes.length)
      symbolCounts.push(`${symbols.classes.length} classes`);
    if (symbols.interfaces.length)
      symbolCounts.push(`${symbols.interfaces.length} interfaces`);
    if (symbols.functions.length)
      symbolCounts.push(`${symbols.functions.length} functions`);
    if (symbols.types.length)
      symbolCounts.push(`${symbols.types.length} types`);
    if (symbols.constants.length)
      symbolCounts.push(`${symbols.constants.length} constants`);
    const symbolSummary = symbolCounts.length
      ? symbolCounts.join(', ')
      : 'No symbols';
    lines.push(`- \`${filePath}\` - ${symbolSummary}`);
  }

  lines.push('');
  lines.push('## Benchmark Files (`benches/`)');
  lines.push('');

  for (const filePath of Object.keys(benchesInventory).sort()) {
    const data = benchesInventory[filePath];
    lines.push(`- \`${filePath}\` - ${data.benchmarks.length} benchmarks`);
    if (data.benchmarks.length) {
      for (const bench of data.benchmarks.slice().sort())
        lines.push(`  - ${bench}`);
    }
    lines.push('');
  }

  lines.push('## Test Files (`tests/`)');
  lines.push('');

  for (const filePath of Object.keys(testsInventory).sort()) {
    const data = testsInventory[filePath];
    lines.push(`- \`${filePath}\` - ${data.behaviors.length} test behaviors`);
    if (data.behaviors.length) {
      for (const b of data.behaviors.slice().sort()) lines.push(`  - ${b}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  console.log('Generating Askr inventory...');
  const srcInventory = generateSrcInventory(path.join(repoRoot, 'src'));
  const benchesInventory = generateBenchesInventory(
    path.join(repoRoot, 'benches')
  );
  const testsInventory = generateTestsInventory(path.join(repoRoot, 'tests'));

  const markdown = generateMarkdownInventory(
    srcInventory,
    benchesInventory,
    testsInventory
  );
  const outFile = path.join(repoRoot, 'inventory.md');
  fs.writeFileSync(outFile, markdown, 'utf8');
  console.log(`Inventory generated: ${outFile}`);

  // Summary
  console.log('\nSummary:');
  console.log(`  Source files: ${Object.keys(srcInventory).length}`);
  console.log(`  Benchmark files: ${Object.keys(benchesInventory).length}`);
  console.log(`  Test files: ${Object.keys(testsInventory).length}`);

  const totalSrcSymbols = Object.values(srcInventory).reduce(
    (acc, file) =>
      acc +
      (file.symbols.functions.length || 0) +
      (file.symbols.classes.length || 0) +
      (file.symbols.interfaces.length || 0),
    0
  );
  const totalBenchmarks = Object.values(benchesInventory).reduce(
    (acc, f) => acc + (f.benchmarks.length || 0),
    0
  );
  const totalBehaviors = Object.values(testsInventory).reduce(
    (acc, f) => acc + (f.behaviors.length || 0),
    0
  );

  console.log(`  Total symbols in src/: ${totalSrcSymbols}`);
  console.log(`  Total benchmarks: ${totalBenchmarks}`);
  console.log(`  Total test behaviors: ${totalBehaviors}`);
}

if (process.argv[1] && process.argv[1].endsWith('generate-inventory.js')) {
  main();
}
