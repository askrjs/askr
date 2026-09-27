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
const specPath = path.join(rootDir, 'docs/reference/spec-guarantees.md');

function headingSlugs(markdown: string): Set<string> {
  return new Set(
    [...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map(([, heading]) =>
      heading!
        .trim()
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s/g, '-')
    )
  );
}

function guaranteeRows(): string[][] {
  const markdown = fs.readFileSync(specPath, 'utf8');
  return markdown
    .split('\n')
    .filter((line) => line.startsWith('| ') && !line.startsWith('| ---'))
    .slice(1)
    .map((line) =>
      line
        .slice(1, -1)
        .split(' | ')
        .map((cell) => cell.trim())
    );
}

function links(cell: string): string[] {
  return [...cell.matchAll(/\]\(([^)]+)\)/g)].map(([, target]) => target!);
}

describe('behavioral contracts table', () => {
  it('should map every guarantee to an existing doc section and test file', () => {
    const rows = guaranteeRows();
    expect(rows.length).toBeGreaterThan(0);
    const broken: string[] = [];

    for (const [guarantee, docs, tests] of rows) {
      const docLinks = links(docs ?? '');
      const testLinks = links(tests ?? '');
      if (docLinks.length === 0 || testLinks.length === 0) {
        broken.push(`${guarantee}: needs a doc link and a test link`);
      }
      for (const target of docLinks) {
        const [file, anchor] = target.split('#');
        const docPath = path.resolve(path.dirname(specPath), file!);
        if (!fs.existsSync(docPath)) {
          broken.push(`${guarantee}: missing doc ${file}`);
        } else if (
          anchor &&
          !headingSlugs(fs.readFileSync(docPath, 'utf8')).has(anchor)
        ) {
          broken.push(`${guarantee}: missing section ${target}`);
        }
      }
      for (const target of testLinks) {
        if (!fs.existsSync(path.resolve(path.dirname(specPath), target))) {
          broken.push(`${guarantee}: missing test ${target}`);
        }
      }
    }

    expect(broken).toEqual([]);
  });
});
