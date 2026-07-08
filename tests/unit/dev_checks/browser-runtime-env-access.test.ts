// @vitest-environment node

import { describe, expect, it } from 'vite-plus/test';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..', '..', '..');
const browserSourceRoots = [
  path.join(rootDir, 'src', 'boot'),
  path.join(rootDir, 'src', 'dev'),
  path.join(rootDir, 'src', 'renderer'),
  path.join(rootDir, 'src', 'router'),
  path.join(rootDir, 'src', 'runtime'),
];

function readSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readSourceFiles(fullPath));
      continue;
    }

    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('Browser runtime env access', () => {
  it('should not use raw process.env in browser runtime sources', () => {
    const violations: string[] = [];

    for (const dir of browserSourceRoots) {
      for (const file of readSourceFiles(dir)) {
        const content = fs.readFileSync(file, 'utf8');
        const lines = content.split(/\r?\n/);

        for (let index = 0; index < lines.length; index += 1) {
          if (lines[index].includes('process.env')) {
            violations.push(
              `${path.relative(rootDir, file)}:${index + 1} ${lines[index].trim()}`
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
