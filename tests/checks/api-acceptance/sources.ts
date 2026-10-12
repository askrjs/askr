import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from '@typescript/typescript6';
import type { ExportInventory } from './scanner.ts';

export interface SourceIdentity {
  repo: string;
  commit: string;
}

interface PackageIdentity {
  repo: string;
  name: string;
  version: string;
  candidate: {
    commit: string;
    tree: string;
    packageJsonSha256: string;
    lockSha256: string;
    archiveSha512: string;
  };
  baseline: { commit: string; packageJsonSha256: string };
}

export interface Inventory extends Omit<ExportInventory, 'packages'> {
  packages: PackageIdentity[];
  symbols: [number, string, string, string, number[]][];
  declarations: [number, string, string, string][];
  evidenceSources: { path: string; sha256: string; url: string }[];
  counts: {
    packages: number;
    finalSymbolPairs: number;
    absentBaselineSymbolPairs: number;
  };
}

export const hash = (
  value: string | Uint8Array,
  algorithm = 'sha256'
): string => createHash(algorithm).update(value).digest('hex');

export function repository(workspace: string, repo: string): string {
  assert.match(repo, /^askrjs\/[a-z][a-z0-9-]*$/);
  return path.join(workspace, repo.split('/')[1]!);
}

export function git(cwd: string, args: string[], input?: string): Buffer {
  return execFileSync('git', args, {
    cwd,
    input,
    maxBuffer: 100 * 1024 * 1024,
  });
}

export function sourceFile(
  workspace: string,
  source: SourceIdentity,
  file: string
): Buffer {
  assert.match(source.commit, /^[a-f0-9]{40}$/);
  return git(repository(workspace, source.repo), [
    'show',
    `${source.commit}:${file}`,
  ]);
}

/** Verify the reviewed source identities before searching any caller. */
export function verifyInventory(workspace: string, inventory: Inventory): void {
  assert.equal(inventory.packages.length, inventory.counts.packages);
  assert.equal(inventory.symbols.length, inventory.counts.finalSymbolPairs);
  assert.equal(
    inventory.absentBaselineSymbols.length,
    inventory.counts.absentBaselineSymbolPairs
  );
  for (const rows of [inventory.symbols, inventory.absentBaselineSymbols])
    assert.equal(
      new Set(rows.map((row) => JSON.stringify(row.slice(0, 3)))).size,
      rows.length,
      'Duplicate inventory tuple'
    );
  for (const pkg of inventory.packages) {
    const source = { repo: pkg.repo, commit: pkg.candidate.commit };
    const tree = git(repository(workspace, pkg.repo), [
      'rev-parse',
      `${source.commit}^{tree}`,
    ])
      .toString()
      .trim();
    assert.equal(tree, pkg.candidate.tree, `Source tree changed: ${pkg.name}`);
    const manifest = sourceFile(workspace, source, 'package.json');
    assert.equal(
      hash(manifest),
      pkg.candidate.packageJsonSha256,
      `Manifest changed: ${pkg.name}`
    );
    const candidate = JSON.parse(manifest.toString());
    assert.equal(candidate.version, pkg.version);
    assert.equal(
      hash(sourceFile(workspace, source, 'package-lock.json')),
      pkg.candidate.lockSha256,
      `Lock changed: ${pkg.name}`
    );
    const baselineManifest = sourceFile(
      workspace,
      { repo: pkg.repo, commit: pkg.baseline.commit },
      'package.json'
    );
    assert.equal(
      hash(baselineManifest),
      pkg.baseline.packageJsonSha256,
      `Baseline manifest changed: ${pkg.name}`
    );
    const baseline = JSON.parse(baselineManifest.toString());
    const rows = inventory.exportMapDecisions.filter(
      (row) => inventory.packages[row.package]!.name === pkg.name
    );
    assert.deepEqual(
      rows.map((row) => row.key).sort(),
      [
        ...new Set([
          ...Object.keys(candidate.exports),
          ...Object.keys(baseline.exports),
        ]),
      ].sort(),
      `Incomplete export map: ${pkg.name}`
    );
    for (const row of rows) {
      assert.deepEqual(row.candidateTarget, candidate.exports[row.key] ?? null);
      assert.deepEqual(row.baselineTarget, baseline.exports[row.key] ?? null);
      assert.equal(
        row.decision,
        Object.hasOwn(candidate.exports, row.key) ? 'KEEP' : 'REMOVE'
      );
    }
  }
  for (const evidence of inventory.evidenceSources) {
    const match =
      /^https:\/\/github.com\/(askrjs\/[a-z0-9-]+)\/blob\/([a-f0-9]{40})\/(.+)$/.exec(
        evidence.url
      );
    assert(match, `Unpinned evidence URL: ${evidence.url}`);
    assert.equal(match[3], evidence.path);
    assert.equal(
      hash(
        sourceFile(
          workspace,
          { repo: match[1]!, commit: match[2]! },
          evidence.path
        )
      ),
      evidence.sha256,
      `Evidence changed: ${evidence.url}`
    );
  }
}

/** Read immutable Git blobs, preserving their order and line numbers. */
export function readSources(workspace: string, source: SourceIdentity) {
  assert.match(source.commit, /^[a-f0-9]{40}$/);
  const cwd = repository(workspace, source.repo);
  const tree = git(cwd, ['rev-parse', `${source.commit}^{tree}`])
    .toString()
    .trim();
  const entries = git(cwd, ['ls-tree', '-rz', source.commit])
    .toString()
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const tab = entry.indexOf('\t');
      return {
        oid: entry.slice(0, tab).split(' ')[2]!,
        file: entry.slice(tab + 1),
      };
    })
    .filter(({ file }) => /\.(?:[cm]?[jt]sx?|md)$/.test(file));
  const buffer = git(
    cwd,
    ['cat-file', '--batch'],
    entries.map((e) => e.oid + '\n').join('')
  );
  let offset = 0;
  const files = entries.map((entry) => {
    const end = buffer.indexOf(10, offset);
    assert(end >= 0, 'Truncated Git blob header');
    const size = Number(buffer.subarray(offset, end).toString().split(' ')[2]);
    assert(Number.isSafeInteger(size) && size >= 0, 'Invalid Git blob size');
    offset = end + 1;
    const text = buffer.subarray(offset, offset + size).toString();
    offset += size + 1;
    return { ...entry, text };
  });
  assert.equal(offset, buffer.length, 'Truncated Git blob body');
  return { tree, files };
}

/** Optional archive qualification independently enumerates all final name/path pairs. */
export function verifyArchives(
  archivesRoot: string,
  inventory: Inventory
): number {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), 'askr-api-inventory-')
  );
  try {
    for (const pkg of inventory.packages) {
      const short = pkg.name.split('/')[1]!;
      const archive = path.join(
        archivesRoot,
        short,
        `askrjs-${short}-0.5.0.tgz`
      );
      assert.equal(
        hash(fs.readFileSync(archive), 'sha512'),
        pkg.candidate.archiveSha512,
        `Archive changed: ${pkg.name}`
      );
      const directory = path.join(temporary, 'node_modules', pkg.name);
      fs.mkdirSync(directory, { recursive: true });
      execFileSync('tar', [
        '-xzf',
        archive,
        '--strip-components=1',
        '-C',
        directory,
      ]);
      assert.equal(
        hash(fs.readFileSync(path.join(directory, 'package.json'))),
        pkg.candidate.packageJsonSha256
      );
    }
    const paths = inventory.declarations.map(([, , file, expected]) => {
      const resolved = path.resolve(temporary, file);
      assert(
        resolved.startsWith(temporary + path.sep),
        'Invalid archive declaration path'
      );
      assert.equal(
        hash(fs.readFileSync(resolved)),
        expected,
        `Declaration changed: ${file}`
      );
      return resolved;
    });
    const program = ts.createProgram([...new Set(paths)], {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      // Enumeration must not depend on unrelated ambient packages near the temp dir.
      types: [],
      skipLibCheck: true,
      noEmit: true,
    });
    const checker = program.getTypeChecker();
    const actual = new Set<string>();
    for (const [index, [pkg, key]] of inventory.declarations.entries()) {
      const source = program.getSourceFile(paths[index]!);
      assert(source, `Missing declaration: ${paths[index]}`);
      const module = checker.getSymbolAtLocation(source);
      for (const symbol of module ? checker.getExportsOfModule(module) : [])
        actual.add(JSON.stringify([pkg, key, symbol.getName()]));
    }
    assert.deepEqual(
      [...actual].sort(),
      inventory.symbols.map((row) => JSON.stringify(row.slice(0, 3))).sort(),
      'Archive exports differ from the committed inventory'
    );
    return actual.size;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
