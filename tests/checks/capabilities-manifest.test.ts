import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';

test('should publish a complete capability manifest', async () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const manifest = JSON.parse(
    await readFile(path.join(root, 'capabilities.json'), 'utf8')
  ) as {
    version: number;
    package: string;
    capabilities: Array<{
      import: string;
      exports: string[];
      docsPath: string;
      [key: string]: unknown;
    }>;
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
      'docsPath',
    ]) {
      expect(capability[field], field).toBeDefined();
    }
    expect(capability.package).toBe('@askrjs/askr');
    expect(Array.isArray(capability.exports)).toBe(true);
    expect(Array.isArray(capability.constraints)).toBe(true);
    await expect(
      readFile(path.join(root, capability.docsPath), 'utf8')
    ).resolves.toBeTruthy();
    const sourceFiles: string[] = [];
    async function collect(directory: string): Promise<void> {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) await collect(entryPath);
        else if (/\.(?:ts|tsx)$/u.test(entry.name)) sourceFiles.push(entryPath);
      }
    }
    await collect(path.join(root, 'src'));
    const source = (
      await Promise.all(sourceFiles.map((file) => readFile(file, 'utf8')))
    ).join('\n');
    for (const name of capability.exports) {
      expect(source).toMatch(new RegExp(`\\b${name}\\b`));
    }
  }
});
