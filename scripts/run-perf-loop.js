import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

function parseArgs(argv) {
  const options = {
    runs: 2,
    outputDir: null,
  };

  for (const arg of argv) {
    if (arg.startsWith('--runs=')) {
      const value = Number(arg.slice('--runs='.length));
      if (Number.isFinite(value) && value >= 1) {
        options.runs = Math.floor(value);
      }
      continue;
    }

    if (arg.startsWith('--output-dir=')) {
      const value = arg.slice('--output-dir='.length).trim();
      if (value.length > 0) {
        options.outputDir = value;
      }
    }
  }

  return options;
}

async function runNodeScript(scriptPath, args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${path.basename(scriptPath)} failed with exit code ${code}`
          )
        );
      }
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();

  const perfScenarioScript = path.join(
    rootDir,
    'scripts',
    'run-perf-scenarios.js'
  );
  const captureBaselineScript = path.join(
    rootDir,
    'scripts',
    'capture-bench-baseline.js'
  );

  console.log('[perf:loop] running benchmark-aligned scenario guardrails');
  await runNodeScript(perfScenarioScript, [], rootDir);

  const baselineArgs = [`--runs=${options.runs}`];
  if (options.outputDir) {
    baselineArgs.push(`--output-dir=${options.outputDir}`);
  }

  console.log(
    `[perf:loop] capturing baseline snapshot with ${options.runs} run(s) per suite`
  );
  await runNodeScript(captureBaselineScript, baselineArgs, rootDir);
}

await main();
