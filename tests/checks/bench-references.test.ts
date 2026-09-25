import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';

// Docs and workflows must only point at benchmark lanes, configs, and files
// that exist. Removing a lane without updating these references leaves the
// scheduled benchmark workflow failing and the docs describing dead commands.

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
const skippedDirs = new Set(['node_modules', 'dist', 'coverage', 'build']);
// The changelog records history, including lanes that were later removed.
const skippedFiles = new Set(['CHANGELOG.md']);

function collect(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (skippedDirs.has(entry.name)) return [];
      if (entry.name.startsWith('.') && entry.name !== '.github') return [];
      return collect(full);
    }
    if (skippedFiles.has(entry.name)) return [];
    return /\.(md|ya?ml)$/.test(entry.name) ? [full] : [];
  });
}

const sources = collect(rootDir).map((file) => ({
  relative: path.relative(rootDir, file).replace(/\\/g, '/'),
  text: fs.readFileSync(file, 'utf8'),
}));
const scripts: Record<string, string> =
  JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
    .scripts ?? {};
const benchFiles = fs
  .readdirSync(path.join(rootDir, 'benches'), { recursive: true })
  .map((file) => path.basename(String(file)));

function references(pattern: RegExp) {
  return sources.flatMap(({ relative, text }) =>
    [...text.matchAll(pattern)].map((match) => ({
      relative,
      value: match[1],
    }))
  );
}

describe('benchmark references', () => {
  it('should only reference bench npm scripts that exist', () => {
    const missing = references(/npm run (bench[\w:-]*)/g)
      .filter(({ value }) => !(value in scripts))
      .map(({ relative, value }) => `${relative}: npm run ${value}`);

    expect([...new Set(missing)]).toEqual([]);
  });

  it('should only reference bench configs that exist', () => {
    const missing = references(/\b(vitest\.bench\.[\w.]+\.ts)\b/g)
      .filter(({ value }) => !fs.existsSync(path.join(rootDir, value)))
      .map(({ relative, value }) => `${relative}: ${value}`);

    expect([...new Set(missing)]).toEqual([]);
  });

  it('should only reference bench lanes and files that exist', () => {
    const missingDirs = references(/\bbenches\/(tier\d+)\b/g)
      .filter(
        ({ value }) => !fs.existsSync(path.join(rootDir, 'benches', value))
      )
      .map(({ relative, value }) => `${relative}: benches/${value}`);
    const missingFiles = references(/\b(tier\d+-[\w-]+\.tsx?)\b/g)
      .filter(({ value }) => !benchFiles.includes(value))
      .map(({ relative, value }) => `${relative}: ${value}`);

    expect([...new Set([...missingDirs, ...missingFiles])]).toEqual([]);
  });

  it('should only offer bench workflow tiers that have a lane script', () => {
    const workflow = fs.readFileSync(
      path.join(rootDir, '.github/workflows/bench.yml'),
      'utf8'
    );
    const tierInput = workflow.match(/\n {6}tier:\n[\s\S]*?options: \[(.*)\]/);
    expect(tierInput, 'bench.yml declares tier options').not.toBeNull();
    const tiers = tierInput![1]
      .split(',')
      .map((option) => option.trim().replace(/^'|'$/g, ''))
      .filter((option) => option !== 'all');
    // The matrix list used for scheduled and "all" runs.
    const allTiers = workflow.match(/'\[((?:"\d+",?)+)\]'/);
    expect(allTiers, 'bench.yml declares the all-tiers matrix').not.toBeNull();
    tiers.push(...JSON.parse(`[${allTiers![1]}]`));

    expect(tiers.length).toBeGreaterThan(0);
    expect(tiers.filter((tier) => !(`bench:tier${tier}` in scripts))).toEqual(
      []
    );
  });
});

describe('repository automation scripts', () => {
  it('should only contain scripts that AGENTS.md explicitly allows', () => {
    const agents = fs.readFileSync(path.join(rootDir, 'AGENTS.md'), 'utf8');
    const unlisted = fs
      .readdirSync(path.join(rootDir, 'scripts'))
      .filter((file) => !agents.includes(`scripts/${file}`));

    expect(unlisted).toEqual([]);
  });
});
