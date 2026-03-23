// @vitest-environment node

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function readAllTestFiles(dir: string): string[] {
  // Skip scanning the dev_checks directory itself to avoid self-reporting
  if (dir.includes(path.join('tests', 'dev_checks'))) return [];

  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      results.push(...readAllTestFiles(full));
    } else if (ent.isFile() && /\.(ts|tsx|js)$/.test(ent.name)) {
      results.push(full);
    }
  }
  return results;
}

const testsDir = path.join(__dirname, '..'); // top-level tests folder
const forbiddenPatterns: Array<{
  name: string;
  regex: RegExp;
  message: string;
}> = [
  {
    name: 'TODO comments',
    regex: /\/\/\s*TODO\b/i,
    message: 'TODO comments should be converted into issues or concrete tests',
  },
  {
    name: 'it.todo / test.todo',
    regex: /\b(it|test)\.todo\b/,
    message: 'Do not leave tests marked as todo',
  },
  {
    name: 'skipped tests',
    regex: /\b(describe|it|test)\.skip\b/,
    message: 'Do not skip tests without an associated issue',
  },
  {
    name: 'un-awaited .rejects',
    regex: /(^|[^\S\r\n])expect\([^]*?\)\.rejects/,
    message: 'Use `await expect(...).rejects` to ensure assertion is awaited',
  },
  {
    name: 'explicit any',
    regex: /:\s*any\b/,
    message: 'Avoid `any` in tests; prefer specific types or `unknown`',
  },
];

describe('Test suite guidelines', () => {
  it('should have no forbidden patterns (TODOs, skipped tests, un-awaited rejects, explicit any)', () => {
    const files = readAllTestFiles(testsDir);
    const failures: Array<{
      file: string;
      line: number;
      snippet: string;
      rule: string;
      message: string;
    }> = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const pat of forbiddenPatterns) {
          if (pat.regex.test(line)) {
            // For un-awaited rejects, we allow the pattern if the line contains 'await'
            if (pat.name === 'un-awaited .rejects' && /await\s+/.test(line))
              continue;
            failures.push({
              file,
              line: i + 1,
              snippet: line.trim(),
              rule: pat.name,
              message: pat.message,
            });
          }
        }
      }
    }

    // Enforce filename conventions for test files: lowercase, and only a-z0-9_- characters
    const allFiles = readAllTestFiles(testsDir);
    const testFiles = allFiles.filter((f) => /\.test\.(ts|tsx)$/.test(f));
    // Enforce test title conventions: all `it()`/`test()` descriptions must start with 'should'
    const titleViolations: Array<{
      file: string;
      line: number;
      snippet: string;
    }> = [];
    for (const f of testFiles) {
      const content = fs.readFileSync(f, 'utf-8');
      const regex = /\b(it|test)\s*\(\s*(['"`])([^'"\n\r]+)\2/gi;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const title = match[3];
        if (!/^should\b/i.test(title)) {
          const line = content.slice(0, match.index).split(/\r?\n/).length;
          titleViolations.push({ file: f, line, snippet: title });
        }
      }
    }

    for (const v of titleViolations) {
      failures.push({
        file: v.file,
        line: v.line,
        snippet: v.snippet,
        rule: 'test title convention',
        message: 'Test titles must start with "should" (lowercase)',
      });
    }
    for (const f of testFiles) {
      const base = path.basename(f);
      if (!/^[a-z0-9_-]+\.test\.(ts|tsx)$/.test(base)) {
        failures.push({
          file: f,
          line: 1,
          snippet: path.relative(process.cwd(), f),
          rule: 'test filename convention',
          message:
            'Test filenames must be lowercase and use only a-z0-9-_ and end with .test.ts or .test.tsx',
        });
      }
    }

    if (failures.length > 0) {
      const summary = failures
        .map(
          (f) =>
            `${path.relative(process.cwd(), f.file)}:${f.line} [${f.rule}] ${f.snippet}  -- ${f.message}`
        )
        .join('\n');
      throw new Error('Test suite guideline violations found:\n' + summary);
    }

    // explicit pass if nothing found
    expect(failures.length).toBe(0);
  });
});
