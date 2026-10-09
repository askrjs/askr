#!/usr/bin/env node
/**
 * Prints the wave-by-wave publish order for the @askrjs package set.
 *
 * Packages depend on each other by range, so a coordinated breaking release has
 * to publish in dependency order. Everything in a wave can publish in parallel;
 * a wave cannot start until the previous one is fully on npm.
 *
 * Usage:
 *   node scripts/publish-order.mjs [sibling-checkout-root]
 *
 * Defaults to the parent directory of this repository, which is where the
 * sibling @askrjs checkouts normally live.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const root = resolve(process.argv[2] ?? dirname(repositoryRoot));

const candidates = new Map();
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const manifestPath = join(root, entry.name, 'package.json');
  if (!existsSync(manifestPath)) continue;
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    // A checkout without a readable manifest is not part of the release set.
    continue;
  }
  if (
    typeof manifest?.name !== 'string' ||
    !manifest.name.startsWith('@askrjs/') ||
    manifest.private === true
  )
    continue;

  const checkouts = candidates.get(manifest.name) ?? [];
  checkouts.push({ dir: entry.name, manifest });
  candidates.set(manifest.name, checkouts);
}

const manifests = new Map();
for (const [name, checkouts] of candidates) {
  const canonicalDirectory =
    name === '@askrjs/askr' ? 'askr' : `askr-${name.slice('@askrjs/'.length)}`;
  const canonical = checkouts.find(({ dir }) => dir === canonicalDirectory);
  if (!canonical && checkouts.length > 1) {
    console.error(
      `Duplicate package ${name} in ${checkouts.map(({ dir }) => dir).join(' and ')}; ` +
        'use the canonical checkout or a root with one checkout per package.'
    );
    process.exit(1);
  }
  manifests.set(name, canonical ?? checkouts[0]);
}

if (manifests.size === 0) {
  console.error(`No publishable @askrjs package manifests found under ${root}`);
  process.exit(1);
}

// Publishing is blocked by runtime and peer edges. devDependencies block CI,
// not publication, so they are deliberately excluded here.
const blocking = ['dependencies', 'peerDependencies'];
const dependenciesOf = (name) => {
  const { manifest } = manifests.get(name);
  const found = new Set();
  for (const section of blocking) {
    for (const dependency of Object.keys(manifest[section] ?? {})) {
      if (dependency !== name && manifests.has(dependency))
        found.add(dependency);
    }
  }
  return found;
};

const pending = new Map(
  [...manifests.keys()].map((name) => [name, dependenciesOf(name)])
);
const published = new Set();
const waves = [];

while (pending.size > 0) {
  const ready = [...pending]
    .filter(([, deps]) => [...deps].every((dep) => published.has(dep)))
    .map(([name]) => name)
    .sort();

  if (ready.length === 0) {
    console.error(
      'Dependency cycle among:',
      [...pending.keys()].sort().join(', ')
    );
    process.exit(1);
  }

  waves.push(ready);
  for (const name of ready) {
    published.add(name);
    pending.delete(name);
  }
}

for (const [index, wave] of waves.entries()) {
  console.log(
    `wave ${index + 1}: ${wave.map((name) => manifests.get(name).dir).join(', ')}`
  );
}
