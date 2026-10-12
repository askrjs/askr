import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { scanText, type ExportInventory } from './scanner.ts';
import { checkReceipt, classifyHits, receiptInputs } from './sweep.ts';
import {
  hash,
  readSources,
  verifyArchives,
  verifyInventory,
  type Inventory,
} from './sources.ts';

const inventory: ExportInventory = {
  packages: [{ name: '@askrjs/fake', repo: 'askrjs/fake' }],
  exportMapDecisions: [{ package: 0, key: '.', decision: 'KEEP' }],
  absentBaselineSymbols: [[0, '.', 'retired', 'REMOVE', []]],
};

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), 'askr-api-sweep-test-')
  );
  roots.push(workspace);
  const repo = path.join(workspace, 'fake');
  fs.mkdirSync(repo);
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  git('init', '--quiet');
  const exports = { '.': { types: './index.d.ts', import: './index.js' } };
  const manifest = JSON.stringify({
    name: '@askrjs/fake',
    version: '0.5.0',
    exports,
  });
  fs.writeFileSync(path.join(repo, 'package.json'), manifest);
  fs.writeFileSync(path.join(repo, 'package-lock.json'), '{}\n');
  fs.writeFileSync(
    path.join(repo, 'index.d.ts'),
    'export declare const kept: number;\n'
  );
  fs.writeFileSync(path.join(repo, 'index.js'), 'export const kept = 1;\n');
  fs.writeFileSync(
    path.join(repo, 'review.md'),
    '`kept` KEEP: explicit consumer API\n'
  );
  git('add', '.');
  git(
    '-c',
    'user.name=API sweep test',
    '-c',
    'user.email=api-sweep@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'fixture'
  );
  const commit = git('rev-parse', 'HEAD');
  const expected: Inventory = {
    packages: [
      {
        name: '@askrjs/fake',
        repo: 'askrjs/fake',
        version: '0.5.0',
        candidate: {
          commit,
          tree: git('rev-parse', 'HEAD^{tree}'),
          packageJsonSha256: hash(manifest),
          lockSha256: hash('{}\n'),
          archiveSha512: '',
        },
        baseline: { commit, packageJsonSha256: hash(manifest) },
      },
    ],
    symbols: [[0, '.', 'kept', 'KEEP', []]],
    absentBaselineSymbols: [],
    declarations: [
      [
        0,
        '.',
        'node_modules/@askrjs/fake/index.d.ts',
        hash(fs.readFileSync(path.join(repo, 'index.d.ts'))),
      ],
    ],
    evidenceSources: [
      {
        path: 'review.md',
        sha256: hash(fs.readFileSync(path.join(repo, 'review.md'))),
        url: `https://github.com/askrjs/fake/blob/${commit}/review.md`,
      },
    ],
    exportMapDecisions: [
      {
        package: 0,
        key: '.',
        decision: 'KEEP',
        candidateTarget: exports['.'],
        baselineTarget: exports['.'],
      },
    ],
    counts: { packages: 1, finalSymbolPairs: 1, absentBaselineSymbolPairs: 0 },
  };
  return { workspace, repo, commit, expected };
}

describe('reproducible cross-package API acceptance sweep', () => {
  it('should reject withdrawn candidate names without counting them as absent baseline names', () => {
    const revised: ExportInventory = {
      ...inventory,
      withdrawnCandidateSymbols: [[0, '.', 'withdrawn', 'REMOVE', []]],
    };
    const found = scanText(
      'caller.ts',
      "import type { withdrawn } from '@askrjs/fake';",
      revised
    );
    expect(revised.absentBaselineSymbols).toHaveLength(1);
    expect(found.hits).toHaveLength(1);
    expect(found.hits[0]).toMatchObject({
      name: 'withdrawn',
      reason: 'removed-name',
    });
  });

  it('should reject withdrawal count drift, public names and double-counted baseline removals', () => {
    const { workspace, expected } = fixture();
    expected.withdrawnCandidateSymbols = [[0, '.', 'withdrawn', 'REMOVE', []]];
    expected.counts.withdrawnCandidateSymbolPairs = 1;
    expect(() => verifyInventory(workspace, expected)).not.toThrow();
    const changedCount = structuredClone(expected);
    changedCount.counts.withdrawnCandidateSymbolPairs = 2;
    expect(() => verifyInventory(workspace, changedCount)).toThrow();
    const stillPublic = structuredClone(expected);
    stillPublic.withdrawnCandidateSymbols![0]![2] = 'kept';
    expect(() => verifyInventory(workspace, stillPublic)).toThrow(
      /Withdrawn candidate name remains public/
    );
    const countedTwice = structuredClone(expected);
    countedTwice.absentBaselineSymbols = [[0, '.', 'withdrawn', 'REMOVE', []]];
    countedTwice.counts.absentBaselineSymbolPairs = 1;
    expect(() => verifyInventory(workspace, countedTwice)).toThrow(
      /Candidate withdrawal counted as baseline removal/
    );
  });

  it('should find retired literal imports, aliases, re-exports, namespace members and dynamic paths', () => {
    const source = `import { retired as local } from '@askrjs/fake';
export { retired as alias } from '@askrjs/fake';
import * as api from '@askrjs/fake'; api.retired();
await import('@askrjs/fake/removed'); require('@askrjs/fake/removed');`;
    const result = scanText('consumer.ts', source, inventory);
    expect(result.hits.map((hit) => [hit.kind, hit.reason])).toEqual([
      ['named', 'removed-name'],
      ['named', 'removed-name'],
      ['dynamic', 'removed-path'],
      ['dynamic', 'removed-path'],
      ['namespace-member', 'removed-name'],
    ]);
  });

  it('should search fenced Markdown and generated imports while preserving source lines', () => {
    const markdown =
      "prose: import { retired } from '@askrjs/fake';\n```ts\nimport { retired } from '@askrjs/fake';\n```\n";
    expect(
      scanText('guide.md', markdown, inventory).hits.map((hit) => hit.line)
    ).toEqual([3]);
    const generator =
      "const output = `import { retired } from '@askrjs/fake';`;\nconst computed = `import { ${name} } from '@askrjs/fake/${path}';`;";
    const result = scanText('generator.ts', generator, inventory);
    expect(result.hits.map((hit) => [hit.line, hit.kind, hit.name])).toEqual([
      [1, 'generated-named', 'retired'],
      [2, 'generated-module', null],
      [2, 'generated-named', '__ASKR_EXPRESSION__'],
    ]);
  });

  it('should keep retained names and paths out of stale findings', () => {
    expect(
      scanText('consumer.ts', "import { kept } from '@askrjs/fake';", inventory)
        .hits
    ).toEqual([]);
  });

  it('should reject executable stale callers and accept immediately associated rejection fixtures', () => {
    const hit = scanText(
      'consumer.ts',
      "import { retired } from '@askrjs/fake';",
      inventory
    ).hits[0]!;
    const source = { source: 0, repo: 'askrjs/fake', commit: 'a'.repeat(40) };
    expect(() => classifyHits([{ ...source, ...hit }], [])).toThrow(
      /Unreviewed executable/
    );
    expect(
      classifyHits(
        [
          {
            ...source,
            ...scanText(
              'consumer.ts',
              "// @ts-expect-error removed API\nimport { retired } from '@askrjs/fake';",
              inventory
            ).hits[0]!,
          },
        ],
        []
      ).negativeReferences
    ).toHaveLength(1);
    const unrelated = scanText(
      'consumer.ts',
      "// @ts-expect-error unrelated\nconst unrelated: number = 'text';\nimport { retired } from '@askrjs/fake';",
      inventory
    ).hits[0]!;
    expect(() => classifyHits([{ ...source, ...unrelated }], [])).toThrow(
      /Unreviewed executable/
    );
    expect(() =>
      classifyHits(
        [
          {
            ...source,
            ...hit,
            context: hit.context + '\n\n\n// @ts-expect-error unrelated',
          },
        ],
        []
      )
    ).toThrow(/Unreviewed executable/);
  });

  it('should require exact computed-hit identities and reject stale or duplicate allowances', () => {
    const hit = {
      source: 0,
      repo: 'askrjs/fake',
      commit: 'a'.repeat(40),
      ...scanText(
        'generator.ts',
        "const out = `import * as api from '@askrjs/fake/${path}';`;",
        inventory
      ).hits[0]!,
    };
    const disposition = {
      repo: hit.repo,
      path: hit.path,
      line: hit.line,
      disposition: 'bounded generator',
      sourceSha256: 'hash',
      expectedHits: [
        {
          module: hit.module,
          name: hit.name,
          kind: hit.kind,
          reason: hit.reason,
        },
      ],
    };
    expect(classifyHits([hit], [disposition]).computedReferenceChecks).toBe(1);
    expect(() => classifyHits([], [disposition])).toThrow(
      /Stale computed disposition/
    );
    expect(() => classifyHits([hit, hit], [disposition])).toThrow(
      /Unreviewed executable/
    );
    expect(() =>
      classifyHits([{ ...hit, module: '@askrjs/fake/another' }], [disposition])
    ).toThrow();
  });

  it('should read pinned Git blobs even when working copies differ', () => {
    const { workspace, repo, commit, expected } = fixture();
    verifyInventory(workspace, expected);
    fs.writeFileSync(path.join(repo, 'index.js'), 'uncommitted stale contents');
    expect(
      readSources(workspace, { repo: 'askrjs/fake', commit }).files.find(
        (file) => file.file === 'index.js'
      )?.text
    ).toBe('export const kept = 1;\n');
  });

  it.each(['tree', 'packageJsonSha256', 'lockSha256'] as const)(
    'should fail closed on a changed candidate %s identity',
    (field) => {
      const { workspace, expected } = fixture();
      expected.packages[0]!.candidate[field] = '0'.repeat(64);
      expect(() => verifyInventory(workspace, expected)).toThrow();
    }
  );

  it('should reject changed baseline hashes, evidence hashes and export targets', () => {
    const { workspace, expected } = fixture();
    const changedBaseline = structuredClone(expected);
    changedBaseline.packages[0]!.baseline.packageJsonSha256 = 'bad';
    expect(() => verifyInventory(workspace, changedBaseline)).toThrow(
      /Baseline manifest changed/
    );
    const changedEvidence = structuredClone(expected);
    changedEvidence.evidenceSources[0]!.sha256 = 'bad';
    expect(() => verifyInventory(workspace, changedEvidence)).toThrow(
      /Evidence changed/
    );
    expected.exportMapDecisions[0]!.candidateTarget = './wrong.js';
    expect(() => verifyInventory(workspace, expected)).toThrow();
  });

  it('should enumerate archive declarations and reject changed archives or invented exports', () => {
    const { workspace, repo, expected } = fixture();
    const packageDirectory = path.join(workspace, 'package');
    fs.cpSync(repo, packageDirectory, {
      recursive: true,
      filter: (file) => !file.includes('.git'),
    });
    const archiveDirectory = path.join(workspace, 'archives', 'fake');
    fs.mkdirSync(archiveDirectory, { recursive: true });
    const archive = path.join(archiveDirectory, 'askrjs-fake-0.5.0.tgz');
    execFileSync('tar', ['-czf', archive, '-C', workspace, 'package']);
    expected.packages[0]!.candidate.archiveSha512 = hash(
      fs.readFileSync(archive),
      'sha512'
    );
    expect(verifyArchives(path.join(workspace, 'archives'), expected)).toBe(1);
    expected.symbols[0]![2] = 'invented';
    expect(() =>
      verifyArchives(path.join(workspace, 'archives'), expected)
    ).toThrow(/Archive exports differ/);
    fs.appendFileSync(archive, 'changed');
    expect(() =>
      verifyArchives(path.join(workspace, 'archives'), expected)
    ).toThrow(/Archive changed/);
  });

  it('should reject changed receipt counts, sources, compiler and tool hashes', () => {
    const receipt = {
      files: 3,
      sources: [{ commit: 'a'.repeat(40) }],
      compilerSha256: 'compiler',
      searchToolSha256: 'tool',
    };
    expect(() => checkReceipt(receipt, structuredClone(receipt))).not.toThrow();
    for (const changed of [
      { ...receipt, files: 4 },
      { ...receipt, sources: [] },
      { ...receipt, compilerSha256: 'other' },
      { ...receipt, searchToolSha256: 'other' },
    ])
      expect(() => checkReceipt(changed, receipt)).toThrow(/receipt is stale/);
  });
  it('should bind the committed receipt to the runner, compiler, lockfile and input artifacts', () => {
    const committed = JSON.parse(
      fs.readFileSync(
        new URL(
          '../../../docs/development/0.5.0-api-caller-sweep.json',
          import.meta.url
        ),
        'utf8'
      )
    );
    for (const [key, value] of Object.entries(receiptInputs()))
      expect(committed[key], `Stale receipt input: ${key}`).toEqual(value);
  });
});
