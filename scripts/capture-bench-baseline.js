import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const DEFAULT_RUNS = 3;

function parseArgs(argv) {
  const options = {
    runs: DEFAULT_RUNS,
    outputDir: path.join('bench-results', 'baselines'),
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

function toSafeSegment(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function benchmarkKey(entry) {
  return `${entry.file}::${entry.group}::${entry.name}`;
}

function formatNumber(value, digits = 3) {
  return Number(value).toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function median(values) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

async function runNpmScript(args, cwd) {
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
        reject(
          new Error(
            `Command failed with exit code ${code}: npm ${args.join(' ')}`
          )
        );
      }
    });
  });
}

function collectBenchmarks(report) {
  const rows = [];

  for (const file of report.files ?? []) {
    for (const group of file.groups ?? []) {
      for (const benchmark of group.benchmarks ?? []) {
        if (
          typeof benchmark.mean !== 'number' ||
          !Number.isFinite(benchmark.mean) ||
          typeof benchmark.hz !== 'number' ||
          !Number.isFinite(benchmark.hz) ||
          typeof benchmark.rme !== 'number' ||
          !Number.isFinite(benchmark.rme)
        ) {
          continue;
        }

        rows.push({
          file: file.filepath,
          group: group.fullName,
          name: benchmark.name,
          meanMs: benchmark.mean,
          hz: benchmark.hz,
          rme: benchmark.rme,
          sampleCount:
            benchmark.sampleCount ??
            (Array.isArray(benchmark.samples)
              ? benchmark.samples.length
              : null),
        });
      }
    }
  }

  return rows;
}

function summarizeSuiteRuns(runs) {
  const byKey = new Map();

  for (const run of runs) {
    for (const benchmark of run.benchmarks) {
      const key = benchmarkKey(benchmark);
      const record = byKey.get(key) ?? {
        file: benchmark.file,
        group: benchmark.group,
        name: benchmark.name,
        runs: [],
      };

      record.runs.push({
        runIndex: run.runIndex,
        meanMs: benchmark.meanMs,
        hz: benchmark.hz,
        rme: benchmark.rme,
        sampleCount: benchmark.sampleCount,
      });
      byKey.set(key, record);
    }
  }

  const benchmarks = [];
  for (const record of byKey.values()) {
    const meanValues = record.runs.map((item) => item.meanMs);
    const hzValues = record.runs.map((item) => item.hz);
    const rmeValues = record.runs.map((item) => item.rme);

    benchmarks.push({
      file: record.file,
      group: record.group,
      name: record.name,
      runCount: record.runs.length,
      medianMeanMs: median(meanValues),
      minMeanMs: Math.min(...meanValues),
      maxMeanMs: Math.max(...meanValues),
      medianHz: median(hzValues),
      minHz: Math.min(...hzValues),
      maxHz: Math.max(...hzValues),
      medianRme: median(rmeValues),
      maxRme: Math.max(...rmeValues),
      runs: record.runs,
    });
  }

  benchmarks.sort((left, right) => {
    if (left.file !== right.file) {
      return left.file.localeCompare(right.file);
    }
    if (left.group !== right.group) {
      return left.group.localeCompare(right.group);
    }
    return left.name.localeCompare(right.name);
  });

  const medianMeans = benchmarks
    .map((item) => item.medianMeanMs)
    .filter((value) => typeof value === 'number' && Number.isFinite(value));

  return {
    benchmarkCount: benchmarks.length,
    suiteMedianOfMediansMs: median(medianMeans),
    benchmarks,
  };
}

async function readReport(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function relativePosix(fromPath, toPath) {
  return path.relative(fromPath, toPath).split(path.sep).join('/');
}

function renderMarkdown(snapshot, outputRoot) {
  const lines = [
    '# Askr Bench Baseline Snapshot',
    '',
    `- Timestamp: ${snapshot.timestamp}`,
    `- Runs per suite: ${snapshot.runsPerSuite}`,
    `- Output directory: ${relativePosix(process.cwd(), outputRoot)}`,
    '',
    '## Suite Summary',
    '',
    '| Suite | Benchmarks | Median of median mean (ms) |',
    '| --- | ---: | ---: |',
  ];

  for (const suite of snapshot.suites) {
    lines.push(
      `| ${suite.label} | ${suite.summary.benchmarkCount} | ${formatNumber(suite.summary.suiteMedianOfMediansMs ?? 0)} |`
    );
  }

  lines.push('', '## Slowest Median Benchmarks', '');

  const allBenchmarks = [];
  for (const suite of snapshot.suites) {
    for (const benchmark of suite.summary.benchmarks) {
      allBenchmarks.push({
        suite: suite.label,
        ...benchmark,
      });
    }
  }

  allBenchmarks
    .filter(
      (item) =>
        typeof item.medianMeanMs === 'number' &&
        Number.isFinite(item.medianMeanMs)
    )
    .sort((left, right) => right.medianMeanMs - left.medianMeanMs)
    .slice(0, 20)
    .forEach((item) => {
      lines.push(
        `- [${item.suite}] ${item.group} / ${item.name}: median ${formatNumber(item.medianMeanMs)} ms (range ${formatNumber(item.minMeanMs)}-${formatNumber(item.maxMeanMs)} ms)`
      );
    });

  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  const rootDir = process.cwd();
  const outputRoot = path.resolve(rootDir, options.outputDir, timestamp);
  const rawDir = path.join(outputRoot, 'raw');

  const suites = [
    {
      label: 'tier1-dom',
      scriptArgs: ['run', 'bench:dom:base', '--', 'benches/tier1/', '--run'],
    },
    {
      label: 'tier1-ssr',
      scriptArgs: ['run', 'bench:ssr:base', '--', 'benches/tier1/', '--run'],
    },
    {
      label: 'tier3-dom',
      scriptArgs: ['run', 'bench:dom:base', '--', 'benches/tier3/', '--run'],
    },
  ];

  await ensureDir(rawDir);

  for (const suite of suites) {
    suite.runs = [];
    const suiteRawDir = path.join(rawDir, toSafeSegment(suite.label));
    await ensureDir(suiteRawDir);

    for (let runIndex = 1; runIndex <= options.runs; runIndex += 1) {
      const runPath = path.join(suiteRawDir, `run-${runIndex}.json`);
      const args = [...suite.scriptArgs, '--outputJson', runPath];
      console.log(`[baseline] ${suite.label} run ${runIndex}/${options.runs}`);
      await runNpmScript(args, rootDir);

      const report = await readReport(runPath);
      suite.runs.push({
        runIndex,
        file: runPath,
        benchmarks: collectBenchmarks(report),
      });
    }

    suite.summary = summarizeSuiteRuns(suite.runs);
  }

  const snapshot = {
    schemaVersion: 1,
    timestamp,
    runsPerSuite: options.runs,
    suites: suites.map((suite) => ({
      label: suite.label,
      summary: suite.summary,
      runs: suite.runs.map((run) => ({
        runIndex: run.runIndex,
        file: relativePosix(outputRoot, run.file),
      })),
    })),
  };

  const summaryJsonPath = path.join(outputRoot, 'summary.json');
  const summaryMdPath = path.join(outputRoot, 'summary.md');
  await fs.writeFile(
    summaryJsonPath,
    `${JSON.stringify(snapshot, null, 2)}\n`,
    'utf8'
  );
  await fs.writeFile(
    summaryMdPath,
    renderMarkdown(snapshot, outputRoot),
    'utf8'
  );

  const latestPath = path.join(
    path.resolve(rootDir, options.outputDir),
    'latest.json'
  );
  await fs.writeFile(
    latestPath,
    `${JSON.stringify(
      {
        timestamp,
        summary: relativePosix(
          path.resolve(rootDir, options.outputDir),
          summaryJsonPath
        ),
        markdown: relativePosix(
          path.resolve(rootDir, options.outputDir),
          summaryMdPath
        ),
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  console.log(
    `[baseline] snapshot created: ${relativePosix(rootDir, summaryJsonPath)}`
  );
  console.log(
    `[baseline] markdown summary: ${relativePosix(rootDir, summaryMdPath)}`
  );
}

await main();
