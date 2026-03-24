import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const officialThemes = ['default', 'tuxedo', 'calico', 'ginger'];

const requiredRootTokens = [
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
  '--ak-z-toast',
  '--ak-z-tooltip',
];

const requiredColorTokens = [
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
];

function parseBlocks(css) {
  const blocks = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/gms;
  let match;

  while ((match = pattern.exec(css))) {
    const selectors = match[1]
      .split(',')
      .map((selector) => selector.replace(/\/\*[\s\S]*?\*\//g, '').trim())
      .filter(Boolean);

    blocks.push({ selectors, body: match[2] });
  }

  return blocks;
}

function tokensFromBlocks(css, selectorPredicate) {
  const tokens = new Set();
  const blocks = parseBlocks(css);

  for (const block of blocks) {
    if (!block.selectors.some(selectorPredicate)) {
      continue;
    }

    for (const match of block.body.matchAll(/(--ak-[a-z0-9-]+)\s*:/g)) {
      tokens.add(match[1]);
    }
  }

  return tokens;
}

function isLightSelector(selector) {
  return /\[data-theme=(['"])light\1\]/.test(selector);
}

function isDarkSelector(selector) {
  return /\[data-theme=(['"])dark\1\]/.test(selector);
}

function isRootSelector(selector) {
  return selector === ':root';
}

function difference(source, target) {
  return [...source].filter((token) => !target.has(token));
}

function assertNoMissing(missing, message) {
  if (missing.length > 0) {
    throw new Error(`${message}: ${missing.join(', ')}`);
  }
}

async function readThemeTokens(theme) {
  const tokensPath = path.join(root, 'src', 'themes', theme, 'tokens.css');
  return readFile(tokensPath, 'utf8');
}

async function main() {
  const defaultCss = await readThemeTokens('default');
  const defaultRootTokens = tokensFromBlocks(defaultCss, isRootSelector);

  for (const theme of officialThemes) {
    const css = await readThemeTokens(theme);
    const rootTokens = tokensFromBlocks(css, isRootSelector);
    const lightTokens = tokensFromBlocks(css, isLightSelector);
    const darkTokens = tokensFromBlocks(css, isDarkSelector);

    assertNoMissing(
      requiredRootTokens.filter((token) => !rootTokens.has(token)),
      `${theme} is missing required root tokens`
    );

    assertNoMissing(
      requiredColorTokens.filter((token) => !lightTokens.has(token)),
      `${theme} is missing required light color tokens`
    );

    assertNoMissing(
      requiredColorTokens.filter((token) => !darkTokens.has(token)),
      `${theme} is missing required dark color tokens`
    );

    assertNoMissing(
      difference(lightTokens, darkTokens).filter((token) =>
        token.startsWith('--ak-color-')
      ),
      `${theme} has light-only color tokens`
    );

    assertNoMissing(
      difference(darkTokens, lightTokens).filter((token) =>
        token.startsWith('--ak-color-')
      ),
      `${theme} has dark-only color tokens`
    );

    assertNoMissing(
      difference(defaultRootTokens, rootTokens),
      `${theme} is missing root contract tokens present in default`
    );

    assertNoMissing(
      difference(rootTokens, defaultRootTokens),
      `${theme} has extra root contract tokens not present in default`
    );
  }

  console.log('Theme token contract verified.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
