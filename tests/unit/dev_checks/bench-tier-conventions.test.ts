// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test';
import fs from 'fs';
import path from 'path';

const benchesDir = path.join(process.cwd(), 'benches');

function readBenchFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...readBenchFiles(fullPath));
      continue;
    }

    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results;
}

describe('Bench tier conventions', () => {
  it('should keep benchmark files aligned with tier naming and verification rules', () => {
    const files = readBenchFiles(benchesDir);
    const failures: string[] = [];

    for (const file of files) {
      const relativePath = path
        .relative(process.cwd(), file)
        .replace(/\\/g, '/');
      const content = fs.readFileSync(file, 'utf8');
      const category = relativePath.split('/')[1];

      if (!['shared', 'micro', 'jsdom', 'ssr', 'browser'].includes(category)) {
        failures.push(
          `${relativePath}: Benchmarks must live under benches/micro, benches/jsdom, benches/ssr, benches/browser, or benches/shared`
        );
      }

      if (relativePath.startsWith('benches/micro/') && file.endsWith('.tsx')) {
        failures.push(
          `${relativePath}: Microbenchmarks must not require JSX, DOM, or jsdom setup`
        );
      }

      if (
        relativePath.startsWith('benches/browser/') &&
        (!relativePath.endsWith('.spec.ts') ||
          content.includes('vite-plus/test'))
      ) {
        failures.push(
          `${relativePath}: Browser benchmarks must be Playwright spec files`
        );
      }

      if (/\/tier1\//.test(relativePath)) {
        if (!path.basename(file).startsWith('tier1-hotpath-')) {
          failures.push(
            `${relativePath}: Tier 1 files must use the tier1-hotpath-* naming convention`
          );
        }

        if (!content.includes('verifyTier1Invariant(')) {
          failures.push(
            `${relativePath}: Tier 1 files must verify their claimed hot path with verifyTier1Invariant()`
          );
        }
      }

      if (
        /\/tier2\//.test(relativePath) &&
        !path.basename(file).startsWith('tier2-subsystem-')
      ) {
        failures.push(
          `${relativePath}: Tier 2 files must use the tier2-subsystem-* naming convention`
        );
      }

      if (
        /\/tier3\//.test(relativePath) &&
        !path.basename(file).startsWith('tier3-system-')
      ) {
        failures.push(
          `${relativePath}: Tier 3 files must use the tier3-system-* naming convention`
        );
      }

      if (
        /\/tier4\//.test(relativePath) &&
        !path.basename(file).startsWith('tier4-integration-')
      ) {
        failures.push(
          `${relativePath}: Tier 4 files must use the tier4-integration-* naming convention`
        );
      }
    }

    expect(failures).toEqual([]);
  });
});
