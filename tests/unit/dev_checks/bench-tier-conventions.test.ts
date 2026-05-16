// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test';
import fs from 'fs';
import path from 'path';

const benchesDir = path.join(process.cwd(), 'benches');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
);

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

      if (!['shared', 'tier1', 'tier2', 'tier3', 'tier4'].includes(category)) {
        failures.push(
          `${relativePath}: Benchmarks must live under benches/tier1, benches/tier2, benches/tier3, benches/tier4, or benches/shared`
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

  it('should keep the aggregate bench script wired to tiered lanes', () => {
    const scripts = packageJson.scripts ?? {};

    expect(typeof scripts.bench).toBe('string');
    expect(typeof scripts['bench:tier1']).toBe('string');
    expect(typeof scripts['bench:tier2']).toBe('string');
    expect(typeof scripts['bench:tier3']).toBe('string');
    expect(typeof scripts['bench:tier4']).toBe('string');
    expect(scripts['bench:tier1']).toContain('vitest.bench.tier1.config.ts');
    expect(scripts['bench:tier2']).toContain('vitest.bench.tier2.config.ts');
    expect(scripts['bench:tier3']).toContain('vitest.bench.tier3.config.ts');
    expect(scripts['bench:tier4']).toContain('vitest.bench.tier4.config.ts');
  });
});
