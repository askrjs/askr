import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from 'vitest';

test('should publish a complete capability manifest', async () => {
  const root = path.resolve(new URL('../..', import.meta.url).pathname);
  const manifest = JSON.parse(
    await readFile(path.join(root, 'capabilities.json'), 'utf8')
  ) as {
    version: number;
    package: string;
    capabilities: Array<Record<string, unknown>>;
  };
  expect(manifest.version).toBe(1);
  expect(manifest.package).toBe('@askrjs/askr');
  expect(manifest.capabilities.length).toBeGreaterThan(0);
  for (const capability of manifest.capabilities) {
    for (const field of [
      'intent',
      'package',
      'import',
      'exports',
      'constraints',
      'stability',
      'docs',
    ]) {
      expect(capability[field], field).toBeDefined();
    }
    expect(capability.package).toBe('@askrjs/askr');
    expect(Array.isArray(capability.exports)).toBe(true);
    expect(Array.isArray(capability.constraints)).toBe(true);
  }
});
