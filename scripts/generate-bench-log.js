import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const resultsDir = path.join(rootDir, 'bench-results');
const tier1Path = path.join(resultsDir, 'tier1.json');
const tier2Path = path.join(resultsDir, 'tier2.json');
const tier3Path = path.join(resultsDir, 'tier3.json');
const tier4Path = path.join(resultsDir, 'tier4.json');
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

function readNumericValue(record, keys) {
  for (const key of keys) {
    const value = record?.[key];

    if (isFiniteNumber(value)) {
      return value;
    }
  }

  return undefined;
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
  const tailHotspots = [...numeric]
    .filter((benchmark) => isFiniteNumber(benchmark.tailRatio))
    .sort((left, right) => right.tailRatio - left.tailRatio)
    .slice(0, HOTSPOT_LIMIT);
  const highRme = numeric
    .filter((benchmark) => benchmark.rme > thresholds.maxRme)
    .sort((left, right) => right.rme - left.rme);

  const lowSamples = numeric
    .filter((benchmark) => benchmark.sampleCount < thresholds.minSamples)
    .sort((left, right) => left.sampleCount - right.sampleCount);

  const zeroResolution = numeric.filter(
    (benchmark) =>
      benchmark.meanMs > 0 &&
      ((isFiniteNumber(benchmark.p75Ms) && benchmark.p75Ms === 0) ||
        (isFiniteNumber(benchmark.p99Ms) && benchmark.p99Ms === 0))
  );

  const mostVariable = [...numeric]
    .sort((left, right) => right.rme - left.rme)
    .slice(0, HOTSPOT_LIMIT);

  const mostStable = [...numeric]
    .sort((left, right) => left.rme - right.rme)
    .slice(0, HOTSPOT_LIMIT);

  return {
    numeric,
    tailHotspots,
    highRme,
    lowSamples,
    mostVariable,
    mostStable,
    zeroResolution,
    failed:
      highRme.length > 0 || lowSamples.length > 0 || zeroResolution.length > 0,
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
  lines.push(
    `- Zero-resolution percentile violations: ${formatNumber(report.zeroResolution.length, 0)}`
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

  lines.push('### Widest Tail');
  lines.push('');
  if (report.tailHotspots.length === 0) {
    lines.push('- none');
  } else {
    for (const benchmark of report.tailHotspots) {
      lines.push(
        `- [${benchmark.lane}] ${benchmark.name}: tail x${formatNumber(
          benchmark.tailRatio,
          1
        )}, p999 ${formatNumber(benchmark.p999Ms, 4)} ms, mean ${formatNumber(
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

  if (report.zeroResolution.length > 0) {
    lines.push('- zero-valued p75 or p99 (batch the operation before timing):');
    for (const benchmark of report.zeroResolution) {
      lines.push(
        `  - [${benchmark.lane}] ${benchmark.name}: p75 ${formatNumber(benchmark.p75Ms, 4)} ms, p99 ${formatNumber(benchmark.p99Ms, 4)} ms`
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
        const meanMs = benchmark.mean;
        const minMs = readNumericValue(benchmark, ['min', 'minMs']);
        const maxMs = readNumericValue(benchmark, ['max', 'maxMs']);
        const p75Ms = readNumericValue(benchmark, ['p75', 'p75Ms']);
        const p99Ms = readNumericValue(benchmark, ['p99', 'p99Ms']);
        const p995Ms = readNumericValue(benchmark, ['p995', 'p995Ms']);
        const p999Ms = readNumericValue(benchmark, ['p999', 'p999Ms']);
        const tailRatio =
          isFiniteNumber(meanMs) && isFiniteNumber(p999Ms) && meanMs > 0
            ? p999Ms / meanMs
            : undefined;

        benchmarks.push({
          lane: laneLabel,
          file: file.filepath,
          group: group.fullName,
          name: benchmark.name,
          hz: benchmark.hz,
          meanMs,
          minMs,
          maxMs,
          p75Ms,
          p99Ms,
          p995Ms,
          p999Ms,
          rme: benchmark.rme,
          sampleCount:
            benchmark.sampleCount ??
            (Array.isArray(benchmark.samples)
              ? benchmark.samples.length
              : undefined),
          tailRatio,
        });
      }
    }
  }

  return benchmarks;
}

function formatBenchmarkSummary(benchmark) {
  const parts = [];

  if (isFiniteNumber(benchmark.hz)) {
    parts.push(`${formatNumber(benchmark.hz)} hz`);
  }

  if (isFiniteNumber(benchmark.meanMs)) {
    parts.push(`mean ${formatNumber(benchmark.meanMs, 4)} ms`);
  }

  if (isFiniteNumber(benchmark.p75Ms)) {
    parts.push(`p75 ${formatNumber(benchmark.p75Ms, 4)} ms`);
  }

  if (isFiniteNumber(benchmark.p99Ms)) {
    parts.push(`p99 ${formatNumber(benchmark.p99Ms, 4)} ms`);
  }

  if (isFiniteNumber(benchmark.p995Ms)) {
    parts.push(`p995 ${formatNumber(benchmark.p995Ms, 4)} ms`);
  }

  if (isFiniteNumber(benchmark.p999Ms)) {
    parts.push(`p999 ${formatNumber(benchmark.p999Ms, 4)} ms`);
  }

  const tailRatio =
    isFiniteNumber(benchmark.tailRatio) && benchmark.tailRatio > 0
      ? benchmark.tailRatio
      : undefined;

  if (isFiniteNumber(tailRatio)) {
    parts.push(`tail x${formatNumber(tailRatio, 1)}`);
  }

  if (isFiniteNumber(benchmark.rme)) {
    parts.push(`rme +/-${formatNumber(benchmark.rme)}%`);
  }

  if (isFiniteNumber(benchmark.sampleCount)) {
    parts.push(`samples ${formatNumber(benchmark.sampleCount, 0)}`);
  }

  return parts;
}

function renderSection(title, benchmarks) {
  const lines = [`## ${title}`, ''];

  for (const benchmark of benchmarks) {
    const parts = formatBenchmarkSummary(benchmark);

    if (parts.length > 0) {
      lines.push(`- ${benchmark.name}: ${parts.join(', ')}`);
    } else {
      lines.push(
        `- ${benchmark.name}: summary only (Vitest JSON omitted numeric stats for this benchmark)`
      );
    }
  }

  lines.push('');
  return lines;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const [tier1Report, tier2Report, tier3Report, tier4Report, browserReport] =
    await Promise.all([
      fs.readFile(tier1Path, 'utf8').then(JSON.parse),
      fs.readFile(tier2Path, 'utf8').then(JSON.parse),
      fs.readFile(tier3Path, 'utf8').then(JSON.parse),
      fs.readFile(tier4Path, 'utf8').then(JSON.parse),
      fs
        .readFile(browserPath, 'utf8')
        .then(JSON.parse)
        .catch(() => null),
    ]);

  const tier1Benchmarks = collectBenchmarks(tier1Report, 'Tier 1');
  const tier2Benchmarks = collectBenchmarks(tier2Report, 'Tier 2');
  const tier3Benchmarks = collectBenchmarks(tier3Report, 'Tier 3');
  const tier4Benchmarks = collectBenchmarks(tier4Report, 'Tier 4');
  const browserTimings = browserReport?.timings ?? null;
  const allBenchmarks = [
    ...tier1Benchmarks,
    ...tier2Benchmarks,
    ...tier3Benchmarks,
    ...tier4Benchmarks,
  ];
  const slowest = allBenchmarks
    .filter((benchmark) => isFiniteNumber(benchmark.hz))
    .sort((left, right) => left.hz - right.hz)
    .slice(0, HOTSPOT_LIMIT);
  const stability = createStabilityReport(allBenchmarks, options);

  const lines = [
    '# Bench Results',
    '',
    'Generated from `bench-results/tier1.json`, `bench-results/tier2.json`, `bench-results/tier3.json`, and `bench-results/tier4.json`.',
    'Each numeric benchmark line includes hz, mean, p75, p99, p995, p999, tail ratio, RME, and sample count when available.',
    '',
    ...renderSection('Tier 1', tier1Benchmarks),
    ...renderSection('Tier 2', tier2Benchmarks),
    ...renderSection('Tier 3', tier3Benchmarks),
    ...renderSection('Tier 4', tier4Benchmarks),
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
      `[bench:verify] Stability thresholds failed: ${stability.highRme.length} high-RME, ${stability.lowSamples.length} low-sample, ${stability.zeroResolution.length} zero-resolution benchmarks.`
    );
    process.exitCode = 1;
  }
}

await main();
