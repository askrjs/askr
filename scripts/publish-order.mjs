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
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const root = resolve(process.argv[2] ?? dirname(repositoryRoot));

const manifests = new Map();
for (const entry of readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const manifestPath = join(root, entry.name, "package.json");
  if (!existsSync(manifestPath)) continue;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.name) manifests.set(manifest.name, { dir: entry.name, manifest });
  } catch {
    // A checkout without a readable manifest is not part of the release set.
  }
}

if (manifests.size === 0) {
  console.error(`No package manifests found under ${root}`);
  process.exit(1);
}

// Publishing is blocked by runtime and peer edges. devDependencies block CI,
// not publication, so they are deliberately excluded here.
const blocking = ["dependencies", "peerDependencies"];
const dependenciesOf = (name) => {
  const { manifest } = manifests.get(name);
  const found = new Set();
  for (const section of blocking) {
    for (const dependency of Object.keys(manifest[section] ?? {})) {
      if (dependency !== name && manifests.has(dependency)) found.add(dependency);
    }
  }
  return found;
};

const pending = new Map([...manifests.keys()].map((name) => [name, dependenciesOf(name)]));
const published = new Set();
const waves = [];

while (pending.size > 0) {
  const ready = [...pending]
    .filter(([, deps]) => [...deps].every((dep) => published.has(dep)))
    .map(([name]) => name)
    .sort();

  if (ready.length === 0) {
    console.error("Dependency cycle among:", [...pending.keys()].sort().join(", "));
    process.exit(1);
  }

  waves.push(ready);
  for (const name of ready) {
    published.add(name);
    pending.delete(name);
  }
}

for (const [index, wave] of waves.entries()) {
  console.log(`wave ${index + 1}: ${wave.map((name) => manifests.get(name).dir).join(", ")}`);
}
