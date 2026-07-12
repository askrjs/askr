import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

function getArgument(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((argument) => argument.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

const tier = getArgument('tier', 'all');
const repeat = Number(getArgument('repeat', '1'));
const raw = getArgument('raw', 'bench-results');
const browser = await chromium.launch({ headless: true });
const chromiumVersion = browser.version();
const chromiumExecutable = chromium.executablePath();
await browser.close();
const chromiumRevision =
  chromiumExecutable.match(/(chromium-\d+)/)?.[1] ?? 'unknown';

const rawResultPaths = raw
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
const metadata = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  runnerImage:
    process.env.ImageOS ??
    process.env.RUNNER_IMAGE ??
    process.env.RUNNER_OS ??
    'local',
  os: `${process.platform} ${os.release()}`,
  architecture: process.arch,
  cpu: os.cpus()[0]?.model ?? 'unknown',
  node: process.version,
  chromium: {
    version: chromiumVersion,
    executable: chromiumExecutable,
    revision: chromiumRevision,
  },
  tier,
  repeat,
  rawResultPaths,
  capturedAt: new Date().toISOString(),
};

await fs.mkdir('bench-results', { recursive: true });
await fs.writeFile(
  path.join('bench-results', `metadata-${tier}-repeat-${repeat}.json`),
  `${JSON.stringify(metadata, null, 2)}\n`
);
console.log(
  `[bench:metadata] captured Chromium ${chromiumVersion} for ${tier} repeat ${repeat}`
);
