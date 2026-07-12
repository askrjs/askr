import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const benchesRoot = path.join(process.cwd(), 'benches');
const manifestPath = path.join(process.cwd(), 'benchmarks', 'guardrails.json');
const targetsDocPath = path.join(
  process.cwd(),
  'docs',
  'benchmarks',
  'performance-targets.md'
);
const failures = [];

async function collectFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files;
}

function propertyName(node) {
  return node.name && ts.isIdentifier(node.name) ? node.name.text : '';
}

function isBenchCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'bench'
  );
}

function isInsideBenchSetup(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isPropertyAssignment(current) && propertyName(current) === 'setup') {
      return true;
    }
  }
  return false;
}

const benchDeclarations = new Map();
for (const file of await collectFiles(benchesRoot)) {
  const sourceText = await fs.readFile(file, 'utf8');
  const declarations = /\bbench\s*\(\s*(['"])(.*?)\1/gs;
  for (const match of sourceText.matchAll(declarations)) {
    const names = benchDeclarations.get(file) ?? new Set();
    names.add(match[2]);
    benchDeclarations.set(file, names);
  }

  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );

  const visit = (node) => {
    if (ts.isPropertyAssignment(node) && propertyName(node) === 'beforeEach') {
      const { line, character } = source.getLineAndCharacterOfPosition(
        node.getStart(source)
      );
      failures.push(
        `${path.relative(process.cwd(), file)}:${line + 1}:${character + 1} benchmark options do not support beforeEach; reset inside the timed operation or alternate state.`
      );
    }
    if (isBenchCall(node) && isInsideBenchSetup(node)) {
      const { line, character } = source.getLineAndCharacterOfPosition(
        node.getStart(source)
      );
      failures.push(
        `${path.relative(process.cwd(), file)}:${line + 1}:${character + 1} benchmarks must be declared at module scope, not from setup.`
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

try {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const workloads = Array.isArray(manifest.workloads) ? manifest.workloads : [];
  const guardrails = Array.isArray(manifest.guardrails)
    ? manifest.guardrails
    : [];
  const workloadIds = new Set();
  const workloadById = new Map();

  if (manifest.version !== 1) {
    failures.push('benchmarks/guardrails.json must declare version 1.');
  }

  for (const workload of workloads) {
    if (
      !workload ||
      typeof workload.id !== 'string' ||
      typeof workload.tier !== 'string' ||
      typeof workload.name !== 'string' ||
      typeof workload.file !== 'string'
    ) {
      failures.push(
        'Every benchmark guardrail workload needs id, tier, name, and file.'
      );
      continue;
    }
    if (workloadIds.has(workload.id)) {
      failures.push(`Duplicate benchmark workload id: ${workload.id}`);
    }
    workloadIds.add(workload.id);
    workloadById.set(workload.id, workload);

    const absoluteFile = path.join(process.cwd(), workload.file);
    const names = benchDeclarations.get(absoluteFile);
    if (!names) {
      failures.push(
        `${workload.id} does not point to a runnable benchmark file: ${workload.file}`
      );
      continue;
    }
    if (!workload.file.includes(`/${workload.tier}/`)) {
      failures.push(
        `${workload.id} tier ${workload.tier} does not match ${workload.file}`
      );
    }
    if (!names.has(workload.name)) {
      failures.push(
        `${workload.id} is not declared by ${workload.file}: ${workload.name}`
      );
    }
  }

  for (const id of guardrails) {
    if (typeof id !== 'string' || !workloadById.has(id)) {
      failures.push(
        `Documented benchmark guardrail is missing from workloads: ${String(id)}`
      );
    }
  }

  const targetsDoc = await fs.readFile(targetsDocPath, 'utf8');
  const documentedIds = new Set();
  for (const match of targetsDoc.matchAll(
    /\|\s*`(tier[1-4]\.[a-z0-9.-]+)`\s*\|/g
  )) {
    documentedIds.add(match[1]);
  }
  for (const id of documentedIds) {
    if (!workloadById.has(id)) {
      failures.push(
        `Documentation names a benchmark guardrail absent from the manifest: ${id}`
      );
    }
  }
  for (const id of guardrails) {
    if (!documentedIds.has(id)) {
      failures.push(
        `Manifest guardrail is not documented in performance-targets.md: ${id}`
      );
    }
  }
} catch (error) {
  failures.push(
    `Unable to validate benchmarks/guardrails.json: ${error instanceof Error ? error.message : String(error)}`
  );
}

if (failures.length > 0) {
  console.error('[bench:contract] Invalid benchmark lifecycle usage:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
