import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const options = {
    base: '',
    candidate: '',
    out: '',
  };

  for (const arg of argv) {
    if (arg.startsWith('--base=')) {
      options.base = arg.slice('--base='.length).trim();
      continue;
    }

    if (arg.startsWith('--candidate=')) {
      options.candidate = arg.slice('--candidate='.length).trim();
      continue;
    }

    if (arg.startsWith('--out=')) {
      options.out = arg.slice('--out='.length).trim();
    }
  }

  return options;
}

function formatMs(value) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function formatPct(value) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function relativePct(base, candidate) {
  if (!Number.isFinite(base) || base === 0 || !Number.isFinite(candidate)) {
    return null;
  }
  return ((candidate - base) / base) * 100;
}

function benchmarkKey(benchmark) {
  return `${benchmark.file}::${benchmark.group}::${benchmark.name}`;
}

function getSuiteMap(snapshot) {
  const map = new Map();
  for (const suite of snapshot.suites ?? []) {
    map.set(suite.label, suite);
  }
  return map;
}

function flattenBenchmarks(snapshot) {
  const map = new Map();
  for (const suite of snapshot.suites ?? []) {
    for (const benchmark of suite.summary?.benchmarks ?? []) {
      map.set(benchmarkKey(benchmark), {
        suite: suite.label,
        ...benchmark,
      });
    }
  }
  return map;
}

function getFocusedBenchmarkRows(baseBenchmarks, candidateBenchmarks) {
  const interestingNames = [
    'create 5,000 table rows',
    'append 1,000 rows to an existing 1,000-row table',
    'replace an entire 1,000-row table with new keyed data',
    'clear a 1,000-row table',
    'create 1,000 table rows',
    'append 1,000 keyed rows from empty',
    'truncate 1,000 keyed rows to empty',
    'reverse 1,000 keyed rows',
    'shuffle 1,000 keyed rows with a fixed permutation',
    'update every 10th row in a 1,000-row table',
  ];

  const rows = [];

  for (const name of interestingNames) {
    const baseEntry = [...baseBenchmarks.values()].find((entry) => entry.name === name);
    const candidateEntry = [...candidateBenchmarks.values()].find(
      (entry) => entry.name === name
    );

    if (!baseEntry || !candidateEntry) {
      continue;
    }

    const delta = relativePct(baseEntry.medianMeanMs, candidateEntry.medianMeanMs);
    rows.push({
      suite: candidateEntry.suite,
      name,
      base: baseEntry.medianMeanMs,
      candidate: candidateEntry.medianMeanMs,
      delta,
    });
  }

  return rows;
}

function renderMarkdown({ basePath, candidatePath, baseSnapshot, candidateSnapshot }) {
  const baseSuiteMap = getSuiteMap(baseSnapshot);
  const candidateSuiteMap = getSuiteMap(candidateSnapshot);

  const baseBenchmarks = flattenBenchmarks(baseSnapshot);
  const candidateBenchmarks = flattenBenchmarks(candidateSnapshot);

  const suiteRows = [];
  for (const [suiteLabel, candidateSuite] of candidateSuiteMap) {
    const baseSuite = baseSuiteMap.get(suiteLabel);
    if (!baseSuite) {
      continue;
    }

    const baseMedian = baseSuite.summary?.suiteMedianOfMediansMs;
    const candidateMedian = candidateSuite.summary?.suiteMedianOfMediansMs;
    suiteRows.push({
      suite: suiteLabel,
      baseMedian,
      candidateMedian,
      delta: relativePct(baseMedian, candidateMedian),
    });
  }

  const benchmarkRows = getFocusedBenchmarkRows(baseBenchmarks, candidateBenchmarks);

  const lines = [
    '# Bench Snapshot Comparison',
    '',
    `- Base: ${basePath}`,
    `- Candidate: ${candidatePath}`,
    `- Base timestamp: ${baseSnapshot.timestamp}`,
    `- Candidate timestamp: ${candidateSnapshot.timestamp}`,
    '',
    '## Suite Medians',
    '',
    '| Suite | Base median (ms) | Candidate median (ms) | Delta |',
    '| --- | ---: | ---: | ---: |',
  ];

  suiteRows
    .sort((left, right) => left.suite.localeCompare(right.suite))
    .forEach((row) => {
      lines.push(
        `| ${row.suite} | ${formatMs(row.baseMedian)} | ${formatMs(row.candidateMedian)} | ${row.delta === null ? 'n/a' : formatPct(row.delta)} |`
      );
    });

  lines.push('', '## Focus Workloads', '', '| Suite | Workload | Base (ms) | Candidate (ms) | Delta |', '| --- | --- | ---: | ---: | ---: |');

  benchmarkRows.forEach((row) => {
    lines.push(
      `| ${row.suite} | ${row.name} | ${formatMs(row.base)} | ${formatMs(row.candidate)} | ${row.delta === null ? 'n/a' : formatPct(row.delta)} |`
    );
  });

  const regressions = benchmarkRows.filter((row) => row.delta !== null && row.delta > 5);
  const wins = benchmarkRows.filter((row) => row.delta !== null && row.delta < -5);

  lines.push('', '## Summary', '');
  lines.push(`- Focus workloads improved (>5% faster): ${wins.length}`);
  lines.push(`- Focus workloads regressed (>5% slower): ${regressions.length}`);

  if (wins.length > 0) {
    lines.push('- Largest improvements:');
    wins
      .sort((left, right) => (left.delta ?? 0) - (right.delta ?? 0))
      .slice(0, 3)
      .forEach((row) => {
        lines.push(`  - ${row.name}: ${formatPct(row.delta ?? 0)}`);
      });
  }

  if (regressions.length > 0) {
    lines.push('- Largest regressions:');
    regressions
      .sort((left, right) => (right.delta ?? 0) - (left.delta ?? 0))
      .slice(0, 3)
      .forEach((row) => {
        lines.push(`  - ${row.name}: ${formatPct(row.delta ?? 0)}`);
      });
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function readSnapshot(snapshotPath) {
  const raw = await fs.readFile(snapshotPath, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.base || !args.candidate) {
    console.error('Usage: node scripts/compare-bench-snapshots.js --base=<summary.json> --candidate=<summary.json> [--out=<file>]');
    process.exit(1);
  }

  const rootDir = process.cwd();
  const basePath = path.resolve(rootDir, args.base);
  const candidatePath = path.resolve(rootDir, args.candidate);

  const [baseSnapshot, candidateSnapshot] = await Promise.all([
    readSnapshot(basePath),
    readSnapshot(candidatePath),
  ]);

  const markdown = renderMarkdown({
    basePath: path.relative(rootDir, basePath).split(path.sep).join('/'),
    candidatePath: path.relative(rootDir, candidatePath).split(path.sep).join('/'),
    baseSnapshot,
    candidateSnapshot,
  });

  if (args.out) {
    const outPath = path.resolve(rootDir, args.out);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, markdown, 'utf8');
    console.log(`[bench:compare] wrote ${path.relative(rootDir, outPath).split(path.sep).join('/')}`);
  } else {
    process.stdout.write(markdown);
  }
}

await main();
