#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const packagesRoot = path.join(repoRoot, 'packages');
const rootPackageJsonPath = path.join(repoRoot, 'package.json');

const forbiddenPackageDirs = new Set(['.github', '.claude', '.vscode', 'docs']);
const errors = [];

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function validateRootLockfile() {
  const rootPackageJson = JSON.parse(
    fs.readFileSync(rootPackageJsonPath, 'utf8')
  );
  assert(
    Array.isArray(rootPackageJson.workspaces),
    'Missing root workspaces config'
  );
  assert(
    rootPackageJson.workspaces.length === 1 &&
      rootPackageJson.workspaces[0] === 'packages/*',
    'Unexpected root workspaces config'
  );
  assert(
    typeof rootPackageJson.packageManager === 'string' &&
      rootPackageJson.packageManager.startsWith('npm@'),
    'Root packageManager must use npm'
  );

  const unexpectedWorkspaceFile = path.join(repoRoot, 'pnpm-workspace.yaml');
  assert(
    !fs.existsSync(unexpectedWorkspaceFile),
    'Unexpected root pnpm-workspace.yaml'
  );

  const unexpectedLockfile = path.join(repoRoot, 'pnpm-lock.yaml');
  assert(!fs.existsSync(unexpectedLockfile), 'Unexpected root pnpm-lock.yaml');
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
    const packageJsonPath = path.join(packageRoot, 'package.json');
    assert(
      fs.existsSync(packageJsonPath),
      `Missing package.json in packages/${entry.name}`
    );

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
