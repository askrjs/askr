import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_COMPONENTS = join(
  __dirname,
  '..',
  'src',
  'themes',
  'default',
  'components'
);
const TEMPLATE_COMPONENTS = join(
  __dirname,
  '..',
  'templates',
  'theme',
  'components'
);
const DEFAULT_TOKENS = join(__dirname, '..', 'src', 'themes', 'default', 'tokens.css');
const TEMPLATE_TOKENS = join(__dirname, '..', 'templates', 'theme', 'tokens.css');
const THEMES_DIR = join(__dirname, '..', 'src', 'themes');

function listCssFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.css'))
    .sort();
}

function extractTokenNames(css: string): string[] {
  return [...css.matchAll(/(--ak-[a-z0-9-]+)/g)]
    .map((match) => match[1])
    .filter((token, index, all) => all.indexOf(token) === index)
    .sort();
}

describe('template parity', () => {
  const defaultFiles = listCssFiles(DEFAULT_COMPONENTS);
  const templateFiles = listCssFiles(TEMPLATE_COMPONENTS);

  it('should find default theme component files', () => {
    expect(defaultFiles.length).toBeGreaterThan(0);
  });

  it('should find template component files', () => {
    expect(templateFiles.length).toBeGreaterThan(0);
  });

  it('template covers every component in the default theme', () => {
    const missingInTemplate = defaultFiles.filter(
      (f) => !templateFiles.includes(f)
    );
    expect(
      missingInTemplate,
      `Default theme has components missing from template: ${missingInTemplate.join(', ')}`
    ).toEqual([]);
  });

  it('template has no extra files not in the default theme', () => {
    const extraInTemplate = templateFiles.filter(
      (f) => !defaultFiles.includes(f)
    );
    expect(
      extraInTemplate,
      `Template has extra components not in default theme: ${extraInTemplate.join(', ')}`
    ).toEqual([]);
  });

  it('template tokens expose the same canonical token names as the default theme', () => {
    const defaultTokens = extractTokenNames(readFileSync(DEFAULT_TOKENS, 'utf-8'));
    const templateTokens = extractTokenNames(readFileSync(TEMPLATE_TOKENS, 'utf-8'));

    expect(templateTokens).toEqual(defaultTokens);
  });

  it('official theme entrypoints use the same canonical layout imports', () => {
    const themeNames = readdirSync(THEMES_DIR).filter((entry) =>
      existsSync(join(THEMES_DIR, entry, 'index.css'))
    );

    const importsByTheme = new Map<string, string[]>();
    for (const theme of themeNames) {
      const css = readFileSync(join(THEMES_DIR, theme, 'index.css'), 'utf-8');
      const imports = css
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('@import '));
      importsByTheme.set(theme, imports);
    }

    const defaultImports = importsByTheme.get('default') ?? [];
    for (const [theme, imports] of importsByTheme) {
      expect(
        imports,
        `${theme} theme imports drift from default`
      ).toEqual(defaultImports);
    }
  });

  it('official theme token files keep the same canonical token names as default', () => {
    const themeNames = readdirSync(THEMES_DIR).filter((entry) =>
      existsSync(join(THEMES_DIR, entry, 'tokens.css'))
    );
    const defaultTokens = extractTokenNames(readFileSync(DEFAULT_TOKENS, 'utf-8'));

    for (const theme of themeNames) {
      const themeTokens = extractTokenNames(
        readFileSync(join(THEMES_DIR, theme, 'tokens.css'), 'utf-8')
      );

      expect(
        themeTokens,
        `${theme} theme token definitions drift from default`
      ).toEqual(defaultTokens);
    }
  });
});
