import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);

function read(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

/** The first prose paragraph after the README title and badges. */
function readmeTagline(): string {
  const lines = read('README.md').split('\n');
  let index = lines.findIndex((line) => line.startsWith('# '));
  index++;
  while (
    index < lines.length &&
    (lines[index].trim() === '' || lines[index].startsWith('[!['))
  ) {
    index++;
  }
  const paragraph: string[] = [];
  while (index < lines.length && lines[index].trim() !== '') {
    paragraph.push(lines[index].trim());
    index++;
  }
  return paragraph.join(' ');
}

describe('runtime premise claims', () => {
  it('should publish the README tagline as the package description', () => {
    const { description } = JSON.parse(read('package.json')) as {
      description: string;
    };
    expect(readmeTagline()).toBe(description);
  });

  it('should keep retired architecture claims out of the published tagline', () => {
    expect(readmeTagline()).not.toMatch(/\blane-scheduled\b|\bactor model\b/iu);
  });
});
