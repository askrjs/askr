import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_THEME_DIR = join(__dirname, '..', 'src', 'themes', 'default');
const TOKENS_FILE = join(DEFAULT_THEME_DIR, 'tokens.css');
const COMPONENTS_DIR = join(DEFAULT_THEME_DIR, 'components');
const THEMES_DIR = join(__dirname, '..', 'src', 'themes');
const TEMPLATE_COMPONENTS_DIR = join(__dirname, '..', 'templates', 'theme', 'components');

const REQUIRED_ROOT_TOKENS = [
  '--ak-font-family-body',
  '--ak-font-family-mono',
  '--ak-font-size-xs',
  '--ak-font-size-sm',
  '--ak-font-size-md',
  '--ak-font-size-lg',
  '--ak-font-size-xl',
  '--ak-font-size-2xl',
  '--ak-font-weight-regular',
  '--ak-font-weight-medium',
  '--ak-font-weight-semibold',
  '--ak-font-weight-bold',
  '--ak-line-height-tight',
  '--ak-line-height-normal',
  '--ak-line-height-relaxed',
  '--ak-space-xs',
  '--ak-space-sm',
  '--ak-space-md',
  '--ak-space-lg',
  '--ak-space-xl',
  '--ak-space-2xl',
  '--ak-space-3xl',
  '--ak-radius-sm',
  '--ak-radius-md',
  '--ak-radius-lg',
  '--ak-radius-xl',
  '--ak-radius-round',
  '--ak-border-width-sm',
  '--ak-border-width-md',
  '--ak-shadow-sm',
  '--ak-shadow-md',
  '--ak-shadow-lg',
  '--ak-focus-ring-width',
  '--ak-focus-ring-offset',
  '--ak-duration-fast',
  '--ak-duration-normal',
  '--ak-duration-slow',
  '--ak-ease-standard',
  '--ak-icon-size-sm',
  '--ak-icon-size-md',
  '--ak-icon-size-lg',
  '--ak-icon-size-xl',
  '--ak-icon-stroke-width-sm',
  '--ak-icon-stroke-width-md',
  '--ak-icon-stroke-width-lg',
  '--ak-icon-stroke-width-xl',
  '--ak-breakpoint-sm',
  '--ak-breakpoint-md',
  '--ak-breakpoint-lg',
  '--ak-breakpoint-xl',
  '--ak-layout-navbar-height',
  '--ak-layout-sidebar-width-sm',
  '--ak-layout-sidebar-width-md',
  '--ak-layout-sidebar-width-lg',
  '--ak-layout-sidebar-width-xl',
  '--ak-layout-sidebar-width',
  '--ak-layout-content-max-width',
  '--ak-z-dropdown',
  '--ak-z-sticky',
  '--ak-z-fixed',
  '--ak-z-modal-backdrop',
  '--ak-z-modal',
  '--ak-z-popover',
  '--ak-z-tooltip',
] as const;

const REQUIRED_COLOR_TOKENS = [
  '--ak-color-primary',
  '--ak-color-primary-hover',
  '--ak-color-primary-active',
  '--ak-color-primary-soft',
  '--ak-color-primary-ink',
  '--ak-color-text',
  '--ak-color-text-muted',
  '--ak-color-text-subtle',
  '--ak-color-text-inverse',
  '--ak-color-bg',
  '--ak-color-surface',
  '--ak-color-surface-muted',
  '--ak-color-surface-raised',
  '--ak-color-surface-overlay',
  '--ak-color-border-subtle',
  '--ak-color-border',
  '--ak-color-border-strong',
  '--ak-color-success',
  '--ak-color-success-soft',
  '--ak-color-success-ink',
  '--ak-color-warning',
  '--ak-color-warning-soft',
  '--ak-color-warning-ink',
  '--ak-color-danger',
  '--ak-color-danger-soft',
  '--ak-color-danger-ink',
  '--ak-color-info',
  '--ak-color-info-soft',
  '--ak-color-info-ink',
  '--ak-color-link',
  '--ak-color-link-hover',
  '--ak-color-focus-ring',
  '--ak-color-disabled-bg',
  '--ak-color-disabled-surface',
  '--ak-color-disabled-border',
  '--ak-color-disabled-text',
  '--ak-color-selected',
  '--ak-color-selected-border',
  '--ak-color-hover',
  '--ak-color-active',
  '--ak-color-backdrop',
] as const;

function extractDefinedTokens(css: string, selectorFilter?: string): Set<string> {
  const tokens = new Set<string>();
  const lines = css.split('\n');

  let inBlock = false;
  let currentSelector = '';

  for (const line of lines) {
    const selectorMatch = line.match(/^([^{]+)\{/);
    if (selectorMatch) {
      currentSelector = selectorMatch[1].trim();
      inBlock = true;
    }

    if (line.includes('}')) {
      inBlock = false;
      currentSelector = '';
    }

    if (inBlock) {
      if (selectorFilter && currentSelector !== selectorFilter) continue;
      const match = line.match(/(--ak-[a-z0-9-]+)\s*:/);
      if (match) {
        tokens.add(match[1]);
      }
    }
  }

  return tokens;
}

function extractReferencedTokens(css: string): Set<string> {
  const tokens = new Set<string>();
  const matches = css.matchAll(/var\((--ak-[a-z0-9-]+)\)/g);
  for (const match of matches) {
    tokens.add(match[1]);
  }
  return tokens;
}

function getComponentCss(): string {
  const files = readdirSync(COMPONENTS_DIR).filter((f) => f.endsWith('.css'));
  return files
    .map((f) => readFileSync(join(COMPONENTS_DIR, f), 'utf-8'))
    .join('\n');
}

function getAllThemeComponentCss(): string {
  const cssParts: string[] = [];
  const componentDirs = [TEMPLATE_COMPONENTS_DIR];

  for (const theme of readdirSync(THEMES_DIR)) {
    const componentDir = join(THEMES_DIR, theme, 'components');
    if (existsSync(componentDir)) {
      componentDirs.push(componentDir);
    }
  }

  for (const componentDir of componentDirs) {
    const files = readdirSync(componentDir).filter((f) => f.endsWith('.css'));
    for (const file of files) {
      cssParts.push(readFileSync(join(componentDir, file), 'utf-8'));
    }
  }

  return cssParts.join('\n');
}

describe('token completeness', () => {
  const tokensCss = readFileSync(TOKENS_FILE, 'utf-8');
  const allDefinedTokens = extractDefinedTokens(tokensCss);
  const rootTokens = extractDefinedTokens(tokensCss, ':root');
  const lightTokens = extractDefinedTokens(tokensCss, '[data-theme="light"]');
  const darkTokens = extractDefinedTokens(tokensCss, '[data-theme="dark"]');
  const componentCss = getComponentCss();
  const referencedTokens = extractReferencedTokens(componentCss);

  it('should define tokens in :root', () => {
    expect(allDefinedTokens.size).toBeGreaterThan(0);
  });

  it('should define every required root token in :root', () => {
    const missing = REQUIRED_ROOT_TOKENS.filter((token) => !rootTokens.has(token));
    expect(
      missing,
      `Required root tokens missing: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('should define every required color token in the light theme block', () => {
    const missing = REQUIRED_COLOR_TOKENS.filter((token) => !lightTokens.has(token));
    expect(
      missing,
      `Required light color tokens missing: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('should define every required color token in the dark theme block', () => {
    const missing = REQUIRED_COLOR_TOKENS.filter((token) => !darkTokens.has(token));
    expect(
      missing,
      `Required dark color tokens missing: ${missing.join(', ')}`
    ).toEqual([]);
  });

  it('should define every design token referenced by components in tokens.css', () => {
    // Some --ak-* variables are component-scoped (set at runtime via inline
    // styles, not design tokens). Exclude these from the check.
    const componentScopedVars = new Set([
      '--ak-progress-percentage',
      '--ak-slider-percentage',
      '--ak-contract-covered',
      '--ak-state-closed',
      '--ak-state-determinate',
      '--ak-state-inactive',
      '--ak-state-off',
      '--ak-state-unchecked',
    ]);

    const missing = [...referencedTokens].filter(
      (token) => !allDefinedTokens.has(token) && !componentScopedVars.has(token)
    );
    expect(missing).toEqual([]);
  });

  it('should keep light and dark theme color token sets aligned', () => {
    const lightColors = [...lightTokens].filter((t) =>
      t.startsWith('--ak-color-')
    );
    const darkColors = [...darkTokens].filter((t) =>
      t.startsWith('--ak-color-')
    );

    const missingInDark = lightColors.filter((t) => !darkTokens.has(t));
    const missingInLight = darkColors.filter((t) => !lightTokens.has(t));

    expect(
      missingInDark,
      `Color tokens in light but missing in dark: ${missingInDark.join(', ')}`
    ).toEqual([]);
    expect(
      missingInLight,
      `Color tokens in dark but missing in light: ${missingInLight.join(', ')}`
    ).toEqual([]);
  });

  it('should not consume deprecated alias tokens in official theme component CSS', () => {
    const aliasReferences = [
      ...getAllThemeComponentCss().matchAll(
        /var\((--ak-color-fg|--ak-color-muted|--ak-font-family)\)/g
      ),
    ].map((match) => match[1]);

    expect(aliasReferences).toEqual([]);
  });
});
