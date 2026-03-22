#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const packagesRoot = path.join(repoRoot, 'packages');
const manifestPath = path.join(repoRoot, 'platform-version.json');

const errors = [];

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readWorkspacePackages() {
  const versionByName = new Map();
  const entries = fs.readdirSync(packagesRoot, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const packageJsonPath = path.join(packagesRoot, entry.name, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      continue;
    }

    const pkg = readJson(packageJsonPath);
    if (typeof pkg.name !== 'string' || typeof pkg.version !== 'string') {
      errors.push(
        `Invalid package metadata in packages/${entry.name}/package.json`
      );
      continue;
    }

    versionByName.set(pkg.name, pkg.version);
  }

  return versionByName;
}

function validateManifestShape(manifest) {
  assert(
    typeof manifest.platformVersion === 'string',
    'platformVersion must be a string'
  );
  assert(
    manifest.platformVersion?.length > 0,
    'platformVersion cannot be empty'
  );

  assert(
    manifest.workspacePackages &&
      typeof manifest.workspacePackages === 'object' &&
      !Array.isArray(manifest.workspacePackages),
    'workspacePackages must be an object map of package name -> version'
  );

  const relatedProjects = manifest.relatedProjects;
  assert(
    relatedProjects &&
      typeof relatedProjects === 'object' &&
      !Array.isArray(relatedProjects),
    'relatedProjects must be an object map'
  );
}

function validateWorkspacePackageVersions(manifestPackages, workspacePackages) {
  const manifestNames = Object.keys(manifestPackages);

  for (const [pkgName, version] of Object.entries(manifestPackages)) {
    assert(
      typeof version === 'string' && version.length > 0,
      `Manifest version must be non-empty for ${pkgName}`
    );

    if (!workspacePackages.has(pkgName)) {
      errors.push(
        `Package listed in platform-version.json not found in workspace: ${pkgName}`
      );
      continue;
    }

    const actualVersion = workspacePackages.get(pkgName);
    if (actualVersion !== version) {
      errors.push(
        `Version mismatch for ${pkgName}: manifest=${version}, workspace=${actualVersion}. Update platform-version.json or package version.`
      );
    }
  }

  for (const pkgName of workspacePackages.keys()) {
    if (!manifestNames.includes(pkgName)) {
      errors.push(
        `Workspace package missing from platform-version.json: ${pkgName}`
      );
    }
  }
}

function validateRelatedProjects(manifest) {
  const projects = manifest.relatedProjects;
  if (!projects || typeof projects !== 'object') {
    return;
  }

  for (const [projectName, meta] of Object.entries(projects)) {
    if (!meta || typeof meta !== 'object') {
      errors.push(`relatedProjects.${projectName} must be an object`);
      continue;
    }

    assert(
      typeof meta.repository === 'string' && meta.repository.length > 0,
      `relatedProjects.${projectName}.repository must be a non-empty string`
    );
    assert(
      typeof meta.branch === 'string' && meta.branch.length > 0,
      `relatedProjects.${projectName}.branch must be a non-empty string`
    );
  }
}

function main() {
  assert(
    fs.existsSync(manifestPath),
    'Missing platform-version.json at repo root'
  );
  assert(fs.existsSync(packagesRoot), 'Missing packages directory');

  if (errors.length > 0) {
    printErrorsAndExit();
  }

  const manifest = readJson(manifestPath);
  validateManifestShape(manifest);

  if (errors.length > 0) {
    printErrorsAndExit();
  }

  const workspacePackages = readWorkspacePackages();
  validateWorkspacePackageVersions(
    manifest.workspacePackages,
    workspacePackages
  );
  validateRelatedProjects(manifest);

  if (errors.length > 0) {
    printErrorsAndExit();
  }

  console.log(
    `Platform version validation passed (${manifest.platformVersion}).`
  );
}

function printErrorsAndExit() {
  console.error('Platform version validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

main();
