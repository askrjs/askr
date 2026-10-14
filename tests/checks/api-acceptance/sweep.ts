import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from '@typescript/typescript6';
import { scanText, type Hit } from './scanner.ts';
import {
  hash,
  readSources,
  sourceFile,
  verifyArchives,
  verifyInventory,
  type Inventory,
  type SourceIdentity,
} from './sources.ts';

interface ComputedDisposition {
  repo: string;
  path: string;
  line: number;
  disposition: string;
  sourceSha256: string;
  expectedHits: Pick<Hit, 'module' | 'name' | 'kind' | 'reason'>[];
}

interface Dispositions {
  consumerSources: SourceIdentity[];
  computedReferences: ComputedDisposition[];
}

interface SourceHit extends Hit, SourceIdentity {
  source: number;
}

/** Match exact reviewed exceptions; new hits or stale allowances fail closed. */
export function classifyHits(
  hits: SourceHit[],
  dispositions: ComputedDisposition[]
) {
  const negativeReferences: SourceHit[] = [];
  const executableStaleCallers: SourceHit[] = [];
  const consumed = new Set<string>();
  for (const hit of hits) {
    if (
      !hit.module.includes('__ASKR_EXPRESSION__') &&
      !hit.name?.includes('__ASKR_EXPRESSION__') &&
      /^\s*\/\/\s*@ts-expect-error\b/.test(
        hit.context.split('\n')[Math.min(2, hit.line - 1) - 1] ?? ''
      )
    ) {
      negativeReferences.push(hit);
      continue;
    }
    const index = dispositions.findIndex(
      (entry) =>
        entry.repo === hit.repo &&
        entry.path === hit.path &&
        entry.line === hit.line
    );
    const entry = dispositions[index];
    const match =
      entry?.expectedHits.findIndex(
        (expected) =>
          expected.module === hit.module &&
          expected.name === hit.name &&
          expected.kind === hit.kind &&
          expected.reason === hit.reason
      ) ?? -1;
    const identity = `${index}:${match}`;
    if (match < 0 || consumed.has(identity)) executableStaleCallers.push(hit);
    else consumed.add(identity);
  }
  for (const [index, entry] of dispositions.entries())
    for (const [match] of entry.expectedHits.entries())
      assert(
        consumed.has(`${index}:${match}`),
        `Stale computed disposition: ${entry.repo}/${entry.path}:${entry.line}`
      );
  assert.deepEqual(
    executableStaleCallers,
    [],
    'Unreviewed executable stale callers'
  );
  return { negativeReferences, computedReferenceChecks: consumed.size };
}

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);
const inventoryPath = path.join(
  root,
  'docs/development/0.5.0-api-inventory.json'
);
const dispositionsPath = path.join(
  root,
  'docs/development/0.5.0-api-caller-dispositions.json'
);
const receiptPath = path.join(
  root,
  'docs/development/0.5.0-api-caller-sweep.json'
);

/** Verify local fingerprints in CI without sibling repositories. */
export function receiptInputs() {
  const searchTools = ['scanner.ts', 'sources.ts', 'sweep.ts'].map((file) => {
    const relative = `tests/checks/api-acceptance/${file}`;
    return {
      path: relative,
      sha256: hash(fs.readFileSync(path.join(root, relative))),
    };
  });
  const require = createRequire(import.meta.url);
  const compilerEntry = require.resolve('@typescript/typescript6');
  const implementation =
    createRequire(compilerEntry).resolve('@typescript/old');
  return {
    compiler: ts.version,
    compilerPackage: {
      name: '@typescript/typescript6',
      version: JSON.parse(
        fs.readFileSync(
          require.resolve('@typescript/typescript6/package.json'),
          'utf8'
        )
      ).version,
      entrySha256: hash(fs.readFileSync(compilerEntry)),
    },
    compilerSha256: hash(fs.readFileSync(implementation)),
    packageLockSha256: hash(
      fs.readFileSync(path.join(root, 'package-lock.json'))
    ),
    inventorySha256: hash(fs.readFileSync(inventoryPath)),
    dispositionsSha256: hash(fs.readFileSync(dispositionsPath)),
    searchTools,
    searchToolSha256: hash(JSON.stringify(searchTools)),
  };
}

export function createReceipt(workspace: string, archivesRoot?: string) {
  const inventory: Inventory = JSON.parse(
    fs.readFileSync(inventoryPath, 'utf8')
  );
  const dispositions: Dispositions = JSON.parse(
    fs.readFileSync(dispositionsPath, 'utf8')
  );
  verifyInventory(workspace, inventory);
  if (archivesRoot) verifyArchives(archivesRoot, inventory);
  const sources: SourceIdentity[] = inventory.packages
    .map((pkg) => ({ repo: pkg.repo, commit: pkg.candidate.commit }))
    .concat(dispositions.consumerSources);
  for (const entry of dispositions.computedReferences) {
    const source = sources.find((candidate) => candidate.repo === entry.repo);
    assert(source, `Missing disposition source: ${entry.repo}`);
    assert.equal(
      hash(sourceFile(workspace, source, entry.path)),
      entry.sourceSha256,
      `Computed disposition source changed: ${entry.repo}/${entry.path}`
    );
  }
  let files = 0;
  let checks = 0;
  const hits: SourceHit[] = [];
  const sourceIdentities = sources.map((source, index) => {
    const read = readSources(workspace, source);
    for (const file of read.files) {
      files++;
      const found = scanText(file.file, file.text, inventory);
      checks += found.checks;
      hits.push(
        ...found.hits.map((hit) => ({ source: index, ...source, ...hit }))
      );
    }
    return {
      ...source,
      tree: read.tree,
      files: read.files.length,
      filesSha256: hash(
        JSON.stringify(read.files.map(({ oid, file }) => ({ oid, file })))
      ),
    };
  });
  const classified = classifyHits(hits, dispositions.computedReferences);
  return {
    schemaVersion: 2,
    status: 'PASS_BOUNDED_EXACT_SOURCE_SEARCH',
    ...receiptInputs(),
    finalSymbolPairs: inventory.symbols.length,
    withdrawnCandidateSymbolPairs:
      inventory.withdrawnCandidateSymbols?.length ?? 0,
    sources: sourceIdentities,
    files,
    importReferenceChecks: checks,
    executableStaleCallersFound: 0,
    deliberateNegativeReferences: classified.negativeReferences.length,
    computedReferenceChecks: classified.computedReferenceChecks,
    unresolvedAcceptance:
      'Merged Auth #82 contracts 93 published baseline pairs to 92 (33 values/59 types), preserving 77 baseline pairs plus 15 additions and withdrawing nine develop-only type names. Complete18 source reconciliation (including shipped Schema/Server fixes), refreshed manifest/archive fingerprints, final integrated consumer qualification and explicit #745 coordinator disposition remain required; this sweep does not close #745, #747 or #744.',
    command:
      'npm run check:api-acceptance -- --workspace-root <sibling-checkouts> --archives-root <candidate-artifacts>',
    boundary:
      'Frozen complete18 sources with the explicitly recorded merged Auth #82 supersession, plus stated Examples and Website commits; source and Markdown-fenced-code import/export/dynamic and namespace-member search, plus generated import/export strings. Markdown prose and computed module/name expressions are excluded. Tests and negative fixtures are included. This is not final integrated graph or runtime/type acceptance.',
    negativeReferences: classified.negativeReferences.map(
      ({ source, path: file, line, module, name, kind }) => ({
        source,
        path: file,
        line,
        module,
        name,
        kind,
        disposition:
          'Immediately associated @ts-expect-error asserts deliberate removed import rejection.',
      })
    ),
    computedReferences: dispositions.computedReferences,
  };
}

export function checkReceipt(actual: unknown, expected: unknown): void {
  assert.deepEqual(
    actual,
    expected,
    'Caller-sweep receipt is stale; inspect changes before regenerating with --write'
  );
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  try {
    const args = process.argv.slice(2);
    const value = (flag: string) =>
      args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
    for (const arg of args)
      if (arg.startsWith('--'))
        assert(
          [
            '--workspace-root',
            '--archives-root',
            '--check',
            '--write',
          ].includes(arg),
          `Unknown option: ${arg}`
        );
    const workspace = value('--workspace-root');
    assert(
      workspace && !workspace.startsWith('--'),
      'Pass --workspace-root with sibling Git checkouts containing the pinned commits'
    );
    assert(
      !(args.includes('--check') && args.includes('--write')),
      'Choose --check or --write'
    );
    const archives = value('--archives-root');
    if (args.includes('--archives-root'))
      assert(
        archives && !archives.startsWith('--'),
        'Pass the directory containing candidate artifact package folders'
      );
    const receipt = createReceipt(
      path.resolve(workspace),
      archives ? path.resolve(archives) : undefined
    );
    if (args.includes('--write'))
      fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
    else
      checkReceipt(receipt, JSON.parse(fs.readFileSync(receiptPath, 'utf8')));
    console.log(
      JSON.stringify({
        status: receipt.status,
        compiler: receipt.compiler,
        files: receipt.files,
        importReferenceChecks: receipt.importReferenceChecks,
        finalSymbolPairs: receipt.finalSymbolPairs,
        deliberateNegativeReferences: receipt.deliberateNegativeReferences,
        computedReferenceChecks: receipt.computedReferenceChecks,
        archiveEnumeration: archives ? 'verified' : 'not requested',
      })
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
