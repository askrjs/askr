import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));

describe('published subpath map', () => {
  test('should match package exports exactly', async () => {
    const pkg = JSON.parse(await readFile(`${root}/package.json`, 'utf8')) as {
      exports: Record<string, unknown>;
    };
    const map = JSON.parse(
      await readFile(path.join(root, 'docs/reference/subpath-map.json'), 'utf8')
    ) as {
      version: number;
      subpaths: Record<string, { purpose: string; stability: string }>;
    };
    expect(map.version).toBe(1);
    expect(Object.keys(map.subpaths).sort()).toEqual(
      Object.keys(pkg.exports).sort()
    );
    for (const entry of Object.values(map.subpaths)) {
      expect(entry.purpose.length).toBeGreaterThan(0);
      expect(entry.stability).toBe('stable');
    }
  });

  test('should document packed declarations for ambiguous exports', async () => {
    const declarations: string[] = [];
    async function collect(directory: string): Promise<void> {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) await collect(entryPath);
        else if (entry.name.endsWith('.d.ts'))
          declarations.push(await readFile(entryPath, 'utf8'));
      }
    }
    await collect(path.join(root, 'dist'));
    const packed = declarations.join('\n');
    expect(packed).toContain('Creates a render-scoped predicate');
    expect(packed).toContain('Creates a render-scoped derived value');
    expect(packed).toContain('Runs an owned task after commit');
    expect(packed).toContain('Creates a render-scoped async resource');
    expect(packed).toContain('Creates a render-time boundary');
  });
});
