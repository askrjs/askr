import { ESLint } from 'eslint';
import { describe, expect, test } from 'vitest';

const eslint = new ESLint({ cwd: process.cwd() });

describe('ESLint: ban Math.random / Date.now in src/ssr', () => {
  test('should flag Math.random in src/ssr files', async () => {
    const code = `const r = Math.random();`;
    const results = await eslint.lintText(code, {
      filePath: 'src/ssr/example.ts',
    });
    const messages = results[0].messages;
    expect(messages.length).toBeGreaterThan(0);
    expect(
      messages.some(
        (m) =>
          /Math\.random/.test(m.message) || /deterministic RNG/.test(m.message)
      )
    ).toBe(true);
  });

  test('should flag Date.now in src/ssr files', async () => {
    const code = `const t = Date.now();`;
    const results = await eslint.lintText(code, {
      filePath: 'src/ssr/example.ts',
    });
    const messages = results[0].messages;
    expect(messages.length).toBeGreaterThan(0);
    expect(
      messages.some(
        (m) =>
          /Date\.now/.test(m.message) || /deterministic clock/.test(m.message)
      )
    ).toBe(true);
  });

  test('should not flag Math.random in non-ssr files', async () => {
    const code = `const r = Math.random();`;
    const results = await eslint.lintText(code, {
      filePath: 'src/other/example.ts',
    });
    const messages = results[0].messages;
    // other lint rules (unused vars etc.) may surface; assert no messages reference the banned globals
    expect(
      messages.some(
        (m) =>
          /Math\.random/.test(m.message) || /deterministic RNG/.test(m.message)
      )
    ).toBe(false);
  });
});
