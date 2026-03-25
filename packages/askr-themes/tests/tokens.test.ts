import { describe, it, expect } from 'vite-plus/test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_THEME_DIR = join(__dirname, '..', 'src', 'themes', 'default');
const COMPONENTS_DIR = join(DEFAULT_THEME_DIR, 'components');
const THEMES_DIR = join(__dirname, '..', 'src', 'themes');
const OFFICIAL_THEMES = ['default', 'tuxedo', 'calico', 'ginger'] as const;
const TEMPLATE_COMPONENTS_DIR = join(
  __dirname,
  '..',
  'templates',
  'theme',
  'components'
);

const REQUIRED_ROOT_TOKENS = [
  '--ak-font-family-body',
  '--ak-font-family-mono',
  '--ak-font-size-xs',
  '--ak-font-size-sm',
  '--ak-font-size-md',
  '--ak-font-size-lg',
  '--ak-font-size-xl',
  '--ak-font-size-2xl',
  '--ak-font-size-heading',
  '--ak-font-size-display',
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
  '--ak-layout-page-gutter',
  '--ak-layout-panel-padding',
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

function parseBlocks(
  css: string
): Array<{ selectors: string[]; body: string }> {
  const blocks: Array<{ selectors: string[]; body: string }> = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/gms;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(css))) {
    const selectors = match[1]
      .split(',')
      .map((selector) => selector.replace(/\/\*[\s\S]*?\*\//g, '').trim())
      .filter(Boolean);

    blocks.push({ selectors, body: match[2] });
  }

  return blocks;
}

function extractDefinedTokens(css: string): Set<string> {
  const tokens = new Set<string>();
  for (const block of parseBlocks(css)) {
    const matches = block.body.matchAll(/(--ak-[a-z0-9-]+)\s*:/g);
    for (const match of matches) {
      tokens.add(match[1]);
    }
  }
  return tokens;
}

function extractTokensForSelector(
  css: string,
  selectorPredicate: (selector: string) => boolean
): Set<string> {
  const tokens = new Set<string>();

  for (const block of parseBlocks(css)) {
    if (!block.selectors.some(selectorPredicate)) {
      continue;
    }

    const matches = block.body.matchAll(/(--ak-[a-z0-9-]+)\s*:/g);
    for (const match of matches) {
      tokens.add(match[1]);
    }
  }

  return tokens;
}

function isRootSelector(selector: string): boolean {
  return selector === ':root';
}

function isLightSelector(selector: string): boolean {
  return /\[data-theme=(['"])light\1\]/.test(selector);
}

function isDarkSelector(selector: string): boolean {
  return /\[data-theme=(['"])dark\1\]/.test(selector);
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

function getThemeTokensCss(theme: string): string {
  return readFileSync(join(THEMES_DIR, theme, 'tokens.css'), 'utf-8');
}

function getThemeTokenSets(theme: string) {
  const css = getThemeTokensCss(theme);
  const allDefinedTokens = extractDefinedTokens(css);
  const rootTokens = extractTokensForSelector(css, isRootSelector);
  const lightTokens = extractTokensForSelector(css, isLightSelector);
  const darkTokens = extractTokensForSelector(css, isDarkSelector);

  return { allDefinedTokens, rootTokens, lightTokens, darkTokens };
}

describe('token completeness', () => {
  const defaultSets = getThemeTokenSets('default');
  const componentCss = getComponentCss();
  const referencedTokens = extractReferencedTokens(componentCss);

  it('should define tokens in :root', () => {
    expect(defaultSets.allDefinedTokens.size).toBeGreaterThan(0);
  });

  it('should define every required root token in :root for all official themes', () => {
    for (const theme of OFFICIAL_THEMES) {
      const { rootTokens } = getThemeTokenSets(theme);
      const missing = REQUIRED_ROOT_TOKENS.filter(
        (token) => !rootTokens.has(token)
      );

      expect(
        missing,
        `${theme} required root tokens missing: ${missing.join(', ')}`
      ).toEqual([]);
    }
  });

  it('should define every required color token in the light theme block for all official themes', () => {
    for (const theme of OFFICIAL_THEMES) {
      const { lightTokens } = getThemeTokenSets(theme);
      const missing = REQUIRED_COLOR_TOKENS.filter(
        (token) => !lightTokens.has(token)
      );

      expect(
        missing,
        `${theme} required light color tokens missing: ${missing.join(', ')}`
      ).toEqual([]);
    }
  });

  it('should define every required color token in the dark theme block for all official themes', () => {
    for (const theme of OFFICIAL_THEMES) {
      const { darkTokens } = getThemeTokenSets(theme);
      const missing = REQUIRED_COLOR_TOKENS.filter(
        (token) => !darkTokens.has(token)
      );

      expect(
        missing,
        `${theme} required dark color tokens missing: ${missing.join(', ')}`
      ).toEqual([]);
    }
  });

  it('should define every design token referenced by default components in default tokens.css', () => {
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
      (token) =>
        !defaultSets.allDefinedTokens.has(token) &&
        !componentScopedVars.has(token)
    );
    expect(missing).toEqual([]);
  });

  it('should keep light and dark theme color token sets aligned for all official themes', () => {
    for (const theme of OFFICIAL_THEMES) {
      const { lightTokens, darkTokens } = getThemeTokenSets(theme);
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
        `${theme} color tokens in light but missing in dark: ${missingInDark.join(', ')}`
      ).toEqual([]);
      expect(
        missingInLight,
        `${theme} color tokens in dark but missing in light: ${missingInLight.join(', ')}`
      ).toEqual([]);
    }
  });

  it('should keep root token contract keys identical across official themes', () => {
    const baseRoot = getThemeTokenSets('default').rootTokens;

    for (const theme of OFFICIAL_THEMES.slice(1)) {
      const rootTokens = getThemeTokenSets(theme).rootTokens;
      const missingComparedToBase = [...baseRoot].filter(
        (token) => !rootTokens.has(token)
      );
      const extraComparedToBase = [...rootTokens].filter(
        (token) => !baseRoot.has(token)
      );

      expect(
        missingComparedToBase,
        `${theme} is missing root tokens from default: ${missingComparedToBase.join(', ')}`
      ).toEqual([]);
      expect(
        extraComparedToBase,
        `${theme} has extra root tokens not in default: ${extraComparedToBase.join(', ')}`
      ).toEqual([]);
    }
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
