import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);
const snapshotPath = path.join(
  rootDir,
  'tests',
  'checks',
  'public-api.snapshot.json'
);

describe('public declaration API snapshot', () => {
  it('should match every export-map declaration entrypoint', () => {
    const generated = execFileSync(
      process.execPath,
      ['scripts/generate-public-api-snapshot.mjs'],
      { cwd: rootDir, encoding: 'utf8' }
    );

    expect(JSON.parse(generated)).toEqual(
      JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
    );
  });
});
