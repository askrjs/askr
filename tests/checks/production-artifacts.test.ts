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
    expect(source).not.toContain('createInitialBenchMetrics');
    expect(source).not.toContain('benchMetrics =');
    expect(source).not.toContain('Duplicate key');
    expect(source).not.toContain('DEVELOPMENT_BUILD_ENABLED = true');
  });
});
