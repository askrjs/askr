import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = join(__dirname, '..', 'src');

function getAllCssFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllCssFiles(fullPath));
    } else if (entry.name.endsWith('.css')) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('no !important', () => {
  const files = getAllCssFiles(SRC_DIR);

  it('should find CSS files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const relative = file.replace(SRC_DIR, 'src');

    it(`${relative}: does not use !important`, () => {
      const css = readFileSync(file, 'utf-8');
      // Strip comments before checking
      const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
      const lines = stripped.split('\n');
      const violations: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('!important')) {
          violations.push(`line ${i + 1}: ${lines[i].trim()}`);
        }
      }

      expect(violations).toEqual([]);
    });
  }
});
