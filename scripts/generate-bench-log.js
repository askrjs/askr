import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.cwd();
const resultsDir = path.join(rootDir, 'bench-results');
const domPath = path.join(resultsDir, 'dom.json');
const ssrPath = path.join(resultsDir, 'ssr.json');
const logPath = path.join(rootDir, 'bench-results.log');

function formatNumber(value, digits = 2) {
  return Number(value).toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
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
  const [domReport, ssrReport] = await Promise.all([
    fs.readFile(domPath, 'utf8').then(JSON.parse),
    fs.readFile(ssrPath, 'utf8').then(JSON.parse),
  ]);

  const domBenchmarks = collectBenchmarks(domReport, 'DOM');
  const ssrBenchmarks = collectBenchmarks(ssrReport, 'SSR');
  const slowest = [...domBenchmarks, ...ssrBenchmarks]
    .filter((benchmark) => isFiniteNumber(benchmark.hz))
    .sort((left, right) => left.hz - right.hz)
    .slice(0, 12);

  const lines = [
    '# Bench Results',
    '',
    'Generated from `bench-results/dom.json` and `bench-results/ssr.json` only.',
    '',
    ...renderSection('DOM', domBenchmarks),
    ...renderSection('SSR', ssrBenchmarks),
    '## Slowest Hotspots',
    '',
    ...slowest.map(
      (benchmark) =>
        `- [${benchmark.lane}] ${benchmark.name}: ${formatNumber(benchmark.hz)} hz`
    ),
    '',
  ];

  await fs.writeFile(logPath, `${lines.join('\n')}`, 'utf8');
}

await main();
