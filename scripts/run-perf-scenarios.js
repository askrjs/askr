import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

async function findBenchmarkScenarioTests(rootDir) {
  const scenariosDir = path.join(rootDir, 'tests', 'jsdom', 'scenarios');
  const entries = await fs.readdir(scenariosDir, { withFileTypes: true });

  const files = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.startsWith('benchmark-') &&
        entry.name.endsWith('.test.tsx')
    )
    .map((entry) =>
      toPosix(path.join('tests', 'jsdom', 'scenarios', entry.name))
    )
    .sort((left, right) => left.localeCompare(right));

  return files;
}

async function runTests(files, cwd) {
  const args = [
    'exec',
    '--',
    'vp',
    'test',
    'run',
    '-c',
    'vitest.jsdom.config.ts',
    ...files,
  ];

  await new Promise((resolve, reject) => {
    const child =
      process.platform === 'win32'
        ? spawn('cmd.exe', ['/d', '/s', '/c', `npm ${args.join(' ')}`], {
            cwd,
            stdio: 'inherit',
            shell: false,
          })
        : spawn('npm', args, {
            cwd,
            stdio: 'inherit',
            shell: false,
          });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`perf scenario tests failed with exit code ${code}`));
      }
    });
  });
}

async function main() {
  const rootDir = process.cwd();
  const benchmarkScenarioFiles = await findBenchmarkScenarioTests(rootDir);

  const files = [
    ...benchmarkScenarioFiles,
    'tests/operations/selector-reactivity.test.tsx',
    'tests/renderer/reactive-props-issues.test.tsx',
  ];

  console.log(
    `[perf:scenarios] running ${files.length} files (${benchmarkScenarioFiles.length} benchmark scenarios + 2 guardrail suites)`
  );

  await runTests(files, rootDir);
}

await main();
