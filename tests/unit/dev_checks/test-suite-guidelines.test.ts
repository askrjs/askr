// @vitest-environment node

import { describe, it, expect } from 'vite-plus/test';
import fs from 'fs';
import path from 'path';

function readAllTestFiles(dir: string): string[] {
  // Skip scanning the dev_checks directory itself to avoid self-reporting
  if (dir.includes(path.join('tests', 'unit', 'dev_checks'))) return [];

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

const rootDir = path.resolve(__dirname, '..', '..', '..');
const testsDir = path.join(rootDir, 'tests');
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
  {
    name: 'placeholder true assertion',
    regex: /expect\(\s*true\s*\)\.toBe\(\s*true\s*\)/,
    message: 'Replace placeholder assertions with observable behavior checks',
  },
];
const TIMER_CALL_PATTERN = /\b(setTimeout|setInterval|sleep)\s*\(/;
const REAL_TIMER_MARKER = '@askr-allow-real-timers';

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
      const usesFakeTimers = /\bvi\.useFakeTimers\s*\(/.test(content);
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

        if (/\bexpect\s*\([^)]*\|\|\s*true\b/.test(line)) {
          failures.push({
            file,
            line: i + 1,
            snippet: line.trim(),
            rule: 'truthy assertion fallback',
            message:
              'Assertions must not use `|| true`; assert the specific behavior instead',
          });
        }

        if (
          TIMER_CALL_PATTERN.test(line) &&
          !/^\s*\/\//.test(line) &&
          !content.includes(REAL_TIMER_MARKER) &&
          !usesFakeTimers
        ) {
          failures.push({
            file,
            line: i + 1,
            snippet: line.trim(),
            rule: 'unmarked test timers',
            message:
              'Use deferred promises or fake timers; mark real browser integration timers with @askr-allow-real-timers',
          });
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

  it('should keep unit tests free of browser and jsdom globals', () => {
    const unitDir = path.join(testsDir, 'unit');
    const files = readAllTestFiles(unitDir).filter((file) =>
      /\.test\.(ts|tsx)$/.test(file)
    );
    const browserGlobalPattern =
      /\b(document|window|navigator|HTMLElement|HTML[A-Za-z]+Element|MutationObserver|KeyboardEvent|CustomEvent)\b/;
    const failures: string[] = [];

    for (const file of files) {
      const relative = path.relative(rootDir, file).replace(/\\/g, '/');
      const content = fs.readFileSync(file, 'utf-8');

      if (browserGlobalPattern.test(content)) {
        failures.push(
          `${relative}: unit tests must not rely on browser or jsdom globals`
        );
      }
    }

    expect(failures).toEqual([]);
  });

  it('should keep browser tests on public browser behavior', () => {
    const browserDir = path.join(testsDir, 'browser');
    const files = readAllTestFiles(browserDir).filter(
      (file) => file.endsWith('.test.ts') || file.endsWith('.test.tsx')
    );
    const failures: string[] = [];

    for (const file of files) {
      const relative = path.relative(rootDir, file).replace(/\\/g, '/');
      const content = fs.readFileSync(file, 'utf-8');

      if (content.includes('../../../src/') || content.includes('../../src/')) {
        failures.push(
          `${relative}: Playwright tests should exercise the fixture app through public browser behavior`
        );
      }
    }

    expect(failures).toEqual([]);
  });
});
