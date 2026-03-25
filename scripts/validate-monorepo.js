#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const packagesRoot = path.join(repoRoot, 'packages');
const rootPackageJsonPath = path.join(repoRoot, 'package.json');
const platformManifestPath = path.join(repoRoot, 'platform.manifest.json');
const allowedStatuses = new Set(['stable', 'experimental', 'internal']);
const allowedArtifactTypes = new Set([
  'compiled-ts',
  'generated-ts',
  'css-assets',
  'source-only',
]);

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

  const rootLockfile = path.join(repoRoot, 'package-lock.json');
  assert(fs.existsSync(rootLockfile), 'Missing root package-lock.json');

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

  assert(fs.existsSync(platformManifestPath), 'Missing platform.manifest.json');

  const platformManifest = JSON.parse(
    fs.readFileSync(platformManifestPath, 'utf8')
  );
  assert(
    Array.isArray(platformManifest.packages),
    'Platform manifest must define a packages array'
  );

  const manifestPackages = new Map();
  const manifestPackagesByName = new Map();
  for (const entry of platformManifest.packages) {
    assert(
      typeof entry?.name === 'string' && entry.name.length > 0,
      'Platform manifest package name must be a string'
    );
    assert(
      typeof entry?.workspace === 'string' &&
        entry.workspace.startsWith('packages/'),
      `Invalid workspace path in platform manifest for ${entry?.name ?? '<unknown>'}`
    );
    assert(
      typeof entry?.packageJson === 'string' &&
        entry.packageJson.endsWith('/package.json'),
      `Invalid packageJson path in platform manifest for ${entry?.name ?? '<unknown>'}`
    );
    assert(
      typeof entry?.role === 'string' && entry.role.length > 0,
      `Missing role in platform manifest for ${entry?.name ?? '<unknown>'}`
    );
    assert(
      typeof entry?.status === 'string' && entry.status.length > 0,
      `Missing status in platform manifest for ${entry?.name ?? '<unknown>'}`
    );
    assert(
      allowedStatuses.has(entry.status),
      `Unsupported platform manifest status for ${entry?.name ?? '<unknown>'}: ${entry.status}`
    );
    assert(
      typeof entry?.public === 'boolean',
      `Missing public flag in platform manifest for ${entry?.name ?? '<unknown>'}`
    );
    assert(
      typeof entry?.publish === 'boolean',
      `Missing publish flag in platform manifest for ${entry?.name ?? '<unknown>'}`
    );
    assert(
      typeof entry?.artifactType === 'string' && entry.artifactType.length > 0,
      `Missing artifactType in platform manifest for ${entry?.name ?? '<unknown>'}`
    );
    assert(
      allowedArtifactTypes.has(entry.artifactType),
      `Unsupported artifactType in platform manifest for ${entry?.name ?? '<unknown>'}: ${entry.artifactType}`
    );
    assert(
      Array.isArray(entry?.consumes),
      `Missing consumes list in platform manifest for ${entry?.name ?? '<unknown>'}`
    );

    manifestPackages.set(entry.workspace, entry);
    manifestPackagesByName.set(entry.name, entry);
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

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const manifestEntry = manifestPackages.get(`packages/${entry.name}`);
    assert(
      manifestEntry !== undefined,
      `Package missing from platform manifest: packages/${entry.name}`
    );
    assert(
      manifestEntry?.name === packageJson.name,
      `Package name mismatch for packages/${entry.name}`
    );
    assert(
      manifestEntry?.packageJson === `packages/${entry.name}/package.json`,
      `Package JSON path mismatch for packages/${entry.name}`
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

  for (const [workspace, entry] of manifestPackages.entries()) {
    assert(
      fs.existsSync(path.join(repoRoot, workspace)),
      `Manifest references missing workspace directory: ${workspace}`
    );
    assert(
      typeof entry.name === 'string' && entry.name.startsWith('@askrjs/'),
      `Unexpected package namespace in platform manifest: ${entry.name}`
    );

    for (const dependencyName of entry.consumes) {
      assert(
        manifestPackagesByName.has(dependencyName),
        `Manifest dependency reference is not declared: ${entry.name} -> ${dependencyName}`
      );
    }
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
