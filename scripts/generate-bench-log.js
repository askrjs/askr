import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const resultsDir = path.join(rootDir, 'bench-results');
const microPath = path.join(resultsDir, 'micro.json');
const jsdomPath = path.join(resultsDir, 'jsdom.json');
const ssrPath = path.join(resultsDir, 'ssr.json');
const browserPath = path.join(resultsDir, 'browser.json');
const logPath = path.join(rootDir, 'bench-results.log');

const DEFAULT_MAX_RME = 15;
const DEFAULT_MIN_SAMPLES = 10;
const HOTSPOT_LIMIT = 12;

function parseArgs(argv) {
  const options = {
    verify: false,
    maxRme: DEFAULT_MAX_RME,
    minSamples: DEFAULT_MIN_SAMPLES,
  };

  for (const arg of argv) {
    if (arg === '--verify') {
      options.verify = true;
      continue;
    }

    if (arg.startsWith('--max-rme=')) {
      const value = Number(arg.slice('--max-rme='.length));
      if (Number.isFinite(value) && value > 0) {
        options.maxRme = value;
      }
      continue;
    }

    if (arg.startsWith('--min-samples=')) {
      const value = Number(arg.slice('--min-samples='.length));
      if (Number.isFinite(value) && value >= 1) {
        options.minSamples = Math.floor(value);
      }
    }
  }

  return options;
}

function formatNumber(value, digits = 2) {
  return Number(value).toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function getNumericBenchmarks(benchmarks) {
  return benchmarks.filter(
    (benchmark) =>
      isFiniteNumber(benchmark.hz) &&
      isFiniteNumber(benchmark.meanMs) &&
      isFiniteNumber(benchmark.rme) &&
      isFiniteNumber(benchmark.sampleCount)
  );
}

function createStabilityReport(benchmarks, thresholds) {
  const numeric = getNumericBenchmarks(benchmarks);
  const highRme = numeric
    .filter((benchmark) => benchmark.rme > thresholds.maxRme)
    .sort((left, right) => right.rme - left.rme);

  const lowSamples = numeric
    .filter((benchmark) => benchmark.sampleCount < thresholds.minSamples)
    .sort((left, right) => left.sampleCount - right.sampleCount);

  const mostVariable = [...numeric]
    .sort((left, right) => right.rme - left.rme)
    .slice(0, HOTSPOT_LIMIT);

  const mostStable = [...numeric]
    .sort((left, right) => left.rme - right.rme)
    .slice(0, HOTSPOT_LIMIT);

  return {
    numeric,
    highRme,
    lowSamples,
    mostVariable,
    mostStable,
    failed: highRme.length > 0 || lowSamples.length > 0,
  };
}

function renderStabilitySection(report, thresholds) {
  const lines = ['## Stability', ''];

  lines.push(
    `- Numeric benchmarks analyzed: ${formatNumber(report.numeric.length, 0)}`
  );
  lines.push(
    `- Thresholds: max RME ${formatNumber(thresholds.maxRme)}%, min samples ${formatNumber(thresholds.minSamples, 0)}`
  );
  lines.push(
    `- High RME violations: ${formatNumber(report.highRme.length, 0)}`
  );
  lines.push(
    `- Low sample violations: ${formatNumber(report.lowSamples.length, 0)}`
  );
  lines.push('');

  lines.push('### Highest RME');
  lines.push('');
  if (report.mostVariable.length === 0) {
    lines.push('- none');
  } else {
    for (const benchmark of report.mostVariable) {
      lines.push(
        `- [${benchmark.lane}] ${benchmark.name}: rme +/-${formatNumber(
          benchmark.rme
        )}%, samples ${formatNumber(benchmark.sampleCount, 0)}, mean ${formatNumber(
          benchmark.meanMs,
          4
        )} ms`
      );
    }
  }
  lines.push('');

  lines.push('### Lowest RME');
  lines.push('');
  if (report.mostStable.length === 0) {
    lines.push('- none');
  } else {
    for (const benchmark of report.mostStable) {
      lines.push(
        `- [${benchmark.lane}] ${benchmark.name}: rme +/-${formatNumber(
          benchmark.rme
        )}%, samples ${formatNumber(benchmark.sampleCount, 0)}`
      );
    }
  }
  lines.push('');

  lines.push('### Violations');
  lines.push('');
  if (!report.failed) {
    lines.push('- none');
    lines.push('');
    return lines;
  }

  if (report.highRme.length > 0) {
    lines.push(`- RME > ${formatNumber(thresholds.maxRme)}%:`);
    for (const benchmark of report.highRme) {
      lines.push(
        `  - [${benchmark.lane}] ${benchmark.name}: rme +/-${formatNumber(
          benchmark.rme
        )}%, samples ${formatNumber(benchmark.sampleCount, 0)}`
      );
    }
  }

  if (report.lowSamples.length > 0) {
    lines.push(`- samples < ${formatNumber(thresholds.minSamples, 0)}:`);
    for (const benchmark of report.lowSamples) {
      lines.push(
        `  - [${benchmark.lane}] ${benchmark.name}: samples ${formatNumber(
          benchmark.sampleCount,
          0
        )}, rme +/-${formatNumber(benchmark.rme)}%`
      );
    }
  }

  lines.push('');
  return lines;
}

function collectBenchmarks(report, laneLabel) {
  const benchmarks = [];

  for (const file of report.files ?? []) {
    for (const group of file.groups ?? []) {
      for (const benchmark of group.benchmarks ?? []) {
        benchmarks.push({
          lane: laneLabel,
          file: file.filepath,
          group: group.fullName,
          name: benchmark.name,
          hz: benchmark.hz,
          meanMs: benchmark.mean,
          rme: benchmark.rme,
          sampleCount:
            benchmark.sampleCount ??
            (Array.isArray(benchmark.samples)
              ? benchmark.samples.length
              : undefined),
        });
      }
    }
  }

  return benchmarks;
}

function renderSection(title, benchmarks) {
  const lines = [`## ${title}`, ''];

  for (const benchmark of benchmarks) {
    if (
      isFiniteNumber(benchmark.hz) &&
      isFiniteNumber(benchmark.meanMs) &&
      isFiniteNumber(benchmark.sampleCount)
    ) {
      lines.push(
        `- ${benchmark.name}: ${formatNumber(benchmark.hz)} hz, mean ${formatNumber(
          benchmark.meanMs,
          4
        )} ms, rme +/-${formatNumber(benchmark.rme)}%, samples ${formatNumber(
          benchmark.sampleCount,
          0
        )}`
      );
      continue;
    }

    lines.push(
      `- ${benchmark.name}: summary only (Vitest JSON omitted numeric stats for this benchmark)`
    );
  }

  lines.push('');
  return lines;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [microReport, jsdomReport, ssrReport, browserReport] =
    await Promise.all([
      fs.readFile(microPath, 'utf8').then(JSON.parse),
      fs.readFile(jsdomPath, 'utf8').then(JSON.parse),
      fs.readFile(ssrPath, 'utf8').then(JSON.parse),
      fs
        .readFile(browserPath, 'utf8')
        .then(JSON.parse)
        .catch(() => null),
    ]);

  const microBenchmarks = collectBenchmarks(microReport, 'Micro');
  const jsdomBenchmarks = collectBenchmarks(jsdomReport, 'jsdom');
  const ssrBenchmarks = collectBenchmarks(ssrReport, 'SSR');
  const browserTimings = browserReport?.timings ?? null;
  const allBenchmarks = [
    ...microBenchmarks,
    ...jsdomBenchmarks,
    ...ssrBenchmarks,
  ];
  const slowest = allBenchmarks
    .filter((benchmark) => isFiniteNumber(benchmark.hz))
    .sort((left, right) => left.hz - right.hz)
    .slice(0, HOTSPOT_LIMIT);
  const stability = createStabilityReport(allBenchmarks, options);

  const lines = [
    '# Bench Results',
    '',
    'Generated from `bench-results/micro.json`, `bench-results/jsdom.json`, and `bench-results/ssr.json`.',
    '',
    ...renderSection('Micro', microBenchmarks),
    ...renderSection('jsdom', jsdomBenchmarks),
    ...renderSection('SSR', ssrBenchmarks),
    '## Browser Trends',
    '',
    ...(browserTimings
      ? Object.entries(browserTimings).map(
          ([name, value]) => `- ${name}: ${formatNumber(value, 4)} ms`
        )
      : ['- no browser trend file captured']),
    '',
    '## Slowest Hotspots',
    '',
    ...slowest.map(
      (benchmark) =>
        `- [${benchmark.lane}] ${benchmark.name}: ${formatNumber(benchmark.hz)} hz`
    ),
    '',
    ...renderStabilitySection(stability, options),
  ];

  await fs.writeFile(logPath, `${lines.join('\n')}`, 'utf8');

  if (options.verify && stability.failed) {
    console.error(
      `[bench:verify] Stability thresholds failed: ${stability.highRme.length} high-RME, ${stability.lowSamples.length} low-sample benchmarks.`
    );
    process.exitCode = 1;
  }
}

await main();
