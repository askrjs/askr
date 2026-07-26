import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));

describe('published subpath map', () => {
  test('matches package exports exactly', async () => {
    const pkg = JSON.parse(await readFile(`${root}/package.json`, 'utf8')) as {
      exports: Record<string, unknown>;
    };
    const map = JSON.parse(
      await readFile(`${root}/docs/reference/subpath-map.json`, 'utf8')
    ) as { version: number; subpaths: string[] };
    expect(map.version).toBe(1);
    expect([...map.subpaths].sort()).toEqual(Object.keys(pkg.exports).sort());
  });
});
