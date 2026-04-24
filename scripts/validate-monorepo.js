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

  if (!Array.isArray(rootPackageJson.workspaces)) {
    return null;
  }

  assert(
    Array.isArray(rootPackageJson.workspaces),
    'Missing root workspaces config'
  );
  const expectedWorkspaces = [
    'packages/askr-core',
    'packages/askr-cli',
    'packages/askr-ui',
    'packages/askr-lucide',
    'packages/askr-themes',
    'packages/askr-vite',
  ];

  assert(
    rootPackageJson.workspaces.length === expectedWorkspaces.length &&
      expectedWorkspaces.every(
        (workspace, index) => rootPackageJson.workspaces[index] === workspace
      ),
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

  return rootPackageJson.workspaces;
}

function validatePackages(workspaces) {
  if (!workspaces || workspaces.length === 0) {
    return;
  }

  if (!fs.existsSync(packagesRoot)) {
    errors.push('Missing packages directory');
    return;
  }

  for (const workspace of workspaces) {
    const packageRoot = path.join(repoRoot, workspace);
    const packageJsonPath = path.join(packageRoot, 'package.json');
    const packageLabel = workspace.replace(/\\/g, '/');

    assert(
      fs.existsSync(packageJsonPath),
      `Missing package.json in ${packageLabel}`
    );

    if (!fs.existsSync(packageRoot)) {
      continue;
    }

    for (const forbidden of forbiddenPackageDirs) {
      const candidate = path.join(packageRoot, forbidden);
      assert(
        !fs.existsSync(candidate),
        `Forbidden package directory found: ${packageLabel}/${forbidden}`
      );
    }

    const packageLock = path.join(packageRoot, 'package-lock.json');
    assert(
      !fs.existsSync(packageLock),
      `Package-local lockfile found: ${packageLabel}/package-lock.json`
    );
  }
}

function main() {
  const workspaces = validateRootLockfile();

  if (!workspaces) {
    console.log('Monorepo validation skipped: no root workspaces configured.');
    return;
  }

  validatePackages(workspaces);

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
