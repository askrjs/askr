import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.resolve(import.meta.dirname, '../..');
const distDir = path.join(rootDir, 'dist');

function readProductionJavaScript(): string {
  if (!fs.existsSync(distDir)) {
    throw new Error('dist is missing; run npm run build before test:checks');
  }

  return fs
    .readdirSync(distDir, { recursive: true })
    .filter(
      (entry): entry is string =>
        typeof entry === 'string' && entry.endsWith('.js')
    )
    .map((entry) => fs.readFileSync(path.join(distDir, entry), 'utf8'))
    .join('\n');
}

describe('production artifact purity', () => {
  it('should exclude live benchmark and development-only state from dist', () => {
    const source = readProductionJavaScript();

    expect(source).not.toContain('__ASKR_BENCH__');
    expect(source).not.toContain('__ASKR_BENCH_BUILD__');
    expect(source).not.toContain('__ASKR_FOR_BENCH__');
    expect(source).not.toContain('__ASKR_PERF__');
    expect(source).not.toContain('createInitialBenchMetrics');
    expect(source).not.toContain('createInitialPerfMetrics');
    expect(source).not.toContain('benchMetrics =');
    expect(source).not.toContain('isBenchBuildEnabled');
    expect(source).not.toContain('globalThis.__ASKR__');
    expect(source).not.toContain('getOrCreateDevNamespace');
    expect(source).not.toMatch(/incDevCounter\(["']/);
    expect(source).not.toContain('__COMPONENT_INSTANCE_ID');
    expect(source).not.toContain('__LAST_FASTPATH_COMMIT_COUNT');
    expect(source).not.toContain('__ENQUEUE_LOGS');
    expect(source).not.toContain('ASKR_FASTPATH_DEBUG');
    expect(source).not.toContain('recordBenchCounter');
    expect(source).not.toContain('isBenchMetricScopeActive');
    expect(source).not.toContain('__OWNERSHIP_DIAGNOSTICS');
    expect(source).not.toContain('adjustOwnershipDiagnostic');
    expect(source).not.toContain('getOwnershipDiagnostics');
    expect(source).not.toContain('trackedRouteGenerations');
    expect(source).not.toContain('portalRegistrations');
    expect(source).not.toContain('routeGenerations');
    expect(source).not.toContain('readableReaders');
    expect(source).not.toContain('queryOwners');
    expect(source).not.toContain('queryCells');
    expect(source).not.toContain('queuedSchedulerWork');
    expect(source).not.toContain('Duplicate key');
    expect(source).not.toContain('DEVELOPMENT_BUILD_ENABLED = true');
  });
});
