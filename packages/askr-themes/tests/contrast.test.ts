import { describe, it, expect } from 'vite-plus/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const THEMES_DIR = join(__dirname, '..', 'src', 'themes');
const OFFICIAL_THEMES = ['default', 'tuxedo', 'calico', 'ginger'] as const;

/**
 * Parse a CSS color value (#hex or rgb/rgba) to [r, g, b, a] (0-255, alpha 0-1).
 */
function parseColor(value: string): [number, number, number, number] | null {
  const trimmed = value.trim();

  // #rrggbb or #rgb
  const hexMatch = trimmed.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
        1,
      ];
    }
    if (hex.length >= 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        1,
      ];
    }
  }

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\s*\)/
  );
  if (rgbMatch) {
    return [
      parseInt(rgbMatch[1], 10),
      parseInt(rgbMatch[2], 10),
      parseInt(rgbMatch[3], 10),
      rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    ];
  }

  return null;
}

/**
 * Composite a semi-transparent foreground color over an opaque background.
 */
function compositeOver(
  fg: [number, number, number, number],
  bg: [number, number, number, number]
): [number, number, number] {
  const a = fg[3];
  return [
    Math.round(fg[0] * a + bg[0] * (1 - a)),
    Math.round(fg[1] * a + bg[1] * (1 - a)),
    Math.round(fg[2] * a + bg[2] * (1 - a)),
  ];
}

/**
 * Compute relative luminance per WCAG 2.1.
 */
function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r / 255, g / 255, b / 255].map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Compute WCAG contrast ratio between two opaque RGB colors.
 */
function contrastRatio(
  c1: [number, number, number],
  c2: [number, number, number]
): number {
  const l1 = relativeLuminance(...c1);
  const l2 = relativeLuminance(...c2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Resolve a parsed color to opaque RGB by compositing over a background if needed.
 */
function resolveToOpaque(
  color: [number, number, number, number],
  bg: [number, number, number, number]
): [number, number, number] {
  if (color[3] >= 1) return [color[0], color[1], color[2]];
  return compositeOver(color, bg);
}

/**
 * Extract color token definitions from a CSS block matching a selector.
 */
function extractColorTokens(
  css: string,
  selectorTest: (sel: string) => boolean
): Map<string, string> {
  const tokens = new Map<string, string>();
  const blockPattern = /([^{}]+)\{([^{}]*)\}/gms;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(css))) {
    const selectors = match[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!selectors.some(selectorTest)) continue;

    const body = match[2];
    const tokenMatches = body.matchAll(
      /(--ak-color-[a-z0-9-]+)\s*:\s*([^;]+)/g
    );
    for (const tm of tokenMatches) {
      tokens.set(tm[1], tm[2].trim());
    }
  }

  return tokens;
}

/**
 * WCAG AA contrast pairs: [foreground token, background token, min ratio, label].
 * 4.5:1 for normal text, 3:1 for large text / UI components.
 */
const CONTRAST_PAIRS: [string, string, number, string][] = [
  // Text on backgrounds
  ['--ak-color-text', '--ak-color-bg', 4.5, 'text on bg'],
  ['--ak-color-text', '--ak-color-surface', 4.5, 'text on surface'],
  ['--ak-color-text-muted', '--ak-color-bg', 3, 'muted text on bg'],
  ['--ak-color-text-muted', '--ak-color-surface', 3, 'muted text on surface'],

  // Inverse text on primary
  [
    '--ak-color-text-inverse',
    '--ak-color-primary',
    4.5,
    'inverse text on primary',
  ],

  // Status ink on status soft
  [
    '--ak-color-success-ink',
    '--ak-color-success-soft',
    3,
    'success ink on soft',
  ],
  [
    '--ak-color-warning-ink',
    '--ak-color-warning-soft',
    3,
    'warning ink on soft',
  ],
  ['--ak-color-danger-ink', '--ak-color-danger-soft', 3, 'danger ink on soft'],
  ['--ak-color-info-ink', '--ak-color-info-soft', 3, 'info ink on soft'],

  // Primary ink on primary soft (badge default)
  [
    '--ak-color-primary-ink',
    '--ak-color-primary-soft',
    3,
    'primary ink on soft',
  ],

  // Link on backgrounds
  ['--ak-color-link', '--ak-color-bg', 3, 'link on bg'],
  ['--ak-color-link', '--ak-color-surface', 3, 'link on surface'],
];

describe('WCAG AA contrast', () => {
  for (const theme of OFFICIAL_THEMES) {
    describe(`${theme} theme`, () => {
      const css = readFileSync(join(THEMES_DIR, theme, 'tokens.css'), 'utf-8');

      for (const mode of ['light', 'dark'] as const) {
        describe(`${mode} mode`, () => {
          const selectorTest =
            mode === 'light'
              ? (s: string) => /\[data-theme=(['"])light\1\]/.test(s)
              : (s: string) => /\[data-theme=(['"])dark\1\]/.test(s);

          const tokens = extractColorTokens(css, selectorTest);

          // Get the page bg for compositing semi-transparent colors
          const pageBgValue = tokens.get('--ak-color-bg');
          const pageBg = pageBgValue ? parseColor(pageBgValue) : null;

          for (const [fgToken, bgToken, minRatio, label] of CONTRAST_PAIRS) {
            it(`${label} (${minRatio}:1)`, () => {
              const fgValue = tokens.get(fgToken);
              const bgValue = tokens.get(bgToken);

              if (!fgValue || !bgValue) {
                // Token not defined — skip (token completeness tests cover this)
                return;
              }

              const fgParsed = parseColor(fgValue);
              const bgParsed = parseColor(bgValue);

              if (!fgParsed || !bgParsed) {
                // Can't parse (may use var() references) — skip
                return;
              }

              // Composite semi-transparent bg over page background
              const baseBg =
                pageBg ??
                ([255, 255, 255, 1] as [number, number, number, number]);
              const bg = resolveToOpaque(bgParsed, baseBg);
              const fg: [number, number, number] = [
                fgParsed[0],
                fgParsed[1],
                fgParsed[2],
              ];

              const ratio = contrastRatio(fg, bg);
              expect(
                ratio,
                `${label}: ${fgToken} (${fgValue}) on ${bgToken} (${bgValue}) = ${ratio.toFixed(2)}:1, need ${minRatio}:1`
              ).toBeGreaterThanOrEqual(minRatio);
            });
          }
        });
      }
    });
  }
});
