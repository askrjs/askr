import { describe, expect, it } from 'vite-plus/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_ICON_CSS = join(
  __dirname,
  '..',
  'src',
  'themes',
  'default',
  'components',
  'icon.css'
);
const TEMPLATE_ICON_CSS = join(
  __dirname,
  '..',
  'templates',
  'theme',
  'components',
  'icon.css'
);
const THEMING_FILE = join(__dirname, '..', 'THEMING.md');
const TOKENS_FILE = join(
  __dirname,
  '..',
  'src',
  'themes',
  'default',
  'tokens.css'
);

describe('icon theme contract', () => {
  it('ships the same icon baseline in default and template themes', () => {
    const defaultCss = readFileSync(DEFAULT_ICON_CSS, 'utf-8');
    const templateCss = readFileSync(TEMPLATE_ICON_CSS, 'utf-8');
    expect(templateCss).toBe(defaultCss);
  });

  it('documents the icon public hooks', () => {
    const docs = readFileSync(THEMING_FILE, 'utf-8');
    expect(docs).toContain('`@askrjs/askr-ui` owns the canonical icon hooks');
    expect(docs).toContain('`data-slot="icon"`');
    expect(docs).toContain('`data-icon`');
    expect(docs).toContain('`data-decorative`');
    expect(docs).toContain('--ak-icon-size-sm');
  });

  it('defines icon size and stroke tokens', () => {
    const tokens = readFileSync(TOKENS_FILE, 'utf-8');
    expect(tokens).toContain('--ak-icon-size-sm');
    expect(tokens).toContain('--ak-icon-size-md');
    expect(tokens).toContain('--ak-icon-size-lg');
    expect(tokens).toContain('--ak-icon-size-xl');
    expect(tokens).toContain('--ak-icon-stroke-width-sm');
    expect(tokens).toContain('--ak-icon-stroke-width-md');
    expect(tokens).toContain('--ak-icon-stroke-width-lg');
    expect(tokens).toContain('--ak-icon-stroke-width-xl');
  });
});
