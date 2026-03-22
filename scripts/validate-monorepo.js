#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const packagesRoot = path.join(repoRoot, 'packages');

const forbiddenPackageDirs = new Set(['.github', '.claude', '.vscode', 'docs']);
const errors = [];

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function validateRootLockfile() {
  const rootLockfile = path.join(repoRoot, 'package-lock.json');
  assert(fs.existsSync(rootLockfile), 'Missing root package-lock.json');
}

function validatePackages() {
  if (!fs.existsSync(packagesRoot)) {
    errors.push('Missing packages directory');
    return;
  }

  const packageEntries = fs
    .readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());

  for (const entry of packageEntries) {
    const packageRoot = path.join(packagesRoot, entry.name);

    for (const forbidden of forbiddenPackageDirs) {
      const candidate = path.join(packageRoot, forbidden);
      assert(
        !fs.existsSync(candidate),
        `Forbidden package directory found: packages/${entry.name}/${forbidden}`
      );
    }

    const packageLock = path.join(packageRoot, 'package-lock.json');
    assert(
      !fs.existsSync(packageLock),
      `Package-local lockfile found: packages/${entry.name}/package-lock.json`
    );
  }
}

function main() {
  validateRootLockfile();
  validatePackages();

  if (errors.length > 0) {
    console.error('Monorepo validation failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('Monorepo validation passed.');
}

main();
