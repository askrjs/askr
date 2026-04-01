import { describe, it, expect } from 'vite-plus/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const COMPONENTS_DIR = join(
  __dirname,
  '..',
  'src',
  'themes',
  'default',
  'components'
);
const TOKENS_FILE = join(
  __dirname,
  '..',
  'src',
  'themes',
  'default',
  'tokens.css'
);
const CLASS_UTILITY_FILES = new Set([
  'product-shell.css',
  'marketing-shell.css',
]);

function getComponentCssFiles(): string[] {
  return readdirSync(COMPONENTS_DIR)
    .filter((f) => f.endsWith('.css'))
    .map((f) => join(COMPONENTS_DIR, f));
}

/**
 * Extract top-level selectors from CSS text.
 * Handles comma-separated selectors and media query contents.
 */
function extractSelectors(css: string): string[] {
  // Strip comments
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');

  const selectors: string[] = [];
  let depth = 0;
  let current = '';
  let inMediaOrSupports = false;

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];

    if (ch === '{') {
      if (depth === 0) {
        // Check if this is a @media / @supports block
        const trimmed = current.trim();
        if (trimmed.startsWith('@media') || trimmed.startsWith('@supports')) {
          inMediaOrSupports = true;
          current = '';
          depth++;
          continue;
        }
        if (trimmed.startsWith('@layer')) {
          current = '';
          depth++;
          continue;
        }
        if (trimmed.startsWith('@keyframes')) {
          // Skip the entire @keyframes block
          current = '';
          depth++;
          continue;
        }
        // It's a selector — split on commas for compound selectors
        const parts = trimmed
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        selectors.push(...parts);
        current = '';
      } else if (depth === 1 && inMediaOrSupports) {
        // Selector inside @media block
        const trimmed = current.trim();
        const parts = trimmed
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        selectors.push(...parts);
        current = '';
      }
      depth++;
      continue;
    }

    if (ch === '}') {
      depth--;
      if (depth === 0 && inMediaOrSupports) {
        inMediaOrSupports = false;
      }
      current = '';
      continue;
    }

    if (depth === 0 || (depth === 1 && inMediaOrSupports)) {
      current += ch;
    }
  }

  return selectors;
}

/**
 * Allowed selector patterns:
 * - Attribute selectors: [data-*], [data-slot="..."], [data-state="..."], etc.
 * - Pseudo-classes: :hover, :focus-visible, :root, :first-child, :where(...), etc.
 * - Pseudo-elements: ::before, ::after, ::placeholder, etc.
 * - Combinators between allowed parts: >, +, ~, space
 *
 * Forbidden:
 * - Class selectors: .foo
 * - ID selectors: #foo
 * - Bare element/type selectors: div, button, span, etc.
 */
function validateSelector(selector: string): {
  valid: boolean;
  reason?: string;
} {
  const normalized = selector.replace(/:where\(([^()]*)\)/g, '$1');
  // Split on combinators but keep the parts
  // A selector like `[data-slot="a"] [data-slot="b"]` has two parts
  const parts = normalized
    .split(/(?<=\])[\s>+~]+(?=\[)|(?<=\))[\s>+~]+(?=\[)/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const part of parts) {
    // Each part should be composed of:
    // - attribute selectors [...]
    // - pseudo-classes :foo
    // - pseudo-elements ::foo

    // Check for class selectors
    if (/(?<!\[)\.\w/.test(part)) {
      return { valid: false, reason: `class selector found: "${part}"` };
    }

    // Check for ID selectors
    if (/#\w/.test(part)) {
      return { valid: false, reason: `ID selector found: "${part}"` };
    }

    // Strip attribute selectors, pseudo-elements, pseudo-classes
    let remainder = part;
    // Remove attribute selectors [...]
    remainder = remainder.replace(/\[[^\]]*\]/g, '');
    // Remove pseudo-elements ::foo(...)
    remainder = remainder.replace(/::[a-z-]+(\([^)]*\))?/g, '');
    // Remove pseudo-classes :foo(...)
    remainder = remainder.replace(/:[a-z-]+(\([^)]*\))?/g, '');
    // Remove combinators and whitespace
    remainder = remainder.replace(/[\s>+~]+/g, '').trim();

    // After stripping, nothing should remain (no bare element selectors)
    if (remainder.length > 0) {
      return {
        valid: false,
        reason: `bare element or unexpected selector fragment: "${remainder}" in "${part}"`,
      };
    }
  }

  return { valid: true };
}

describe('CSS selector contract', () => {
  const files = getComponentCssFiles();

  it('should find component CSS files', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const filename = file.split(/[/\\]/).pop()!;

    it(`${filename}: uses only data-attribute selectors (no classes, IDs, or elements)`, () => {
      if (CLASS_UTILITY_FILES.has(filename)) {
        return;
      }

      const css = readFileSync(file, 'utf-8');
      const selectors = extractSelectors(css);

      const violations: string[] = [];
      for (const sel of selectors) {
        const result = validateSelector(sel);
        if (!result.valid) {
          violations.push(`${result.reason} in selector "${sel}"`);
        }
      }

      expect(violations).toEqual([]);
    });
  }
});

describe('layout selector scoping', () => {
  const files = getComponentCssFiles();
  const broadLayoutSlotPattern = /\[data-slot="(main|sidebar|navbar)"\]/;

  for (const file of files) {
    const filename = file.split(/[/\\]/).pop()!;

    it(`${filename}: anchors broad layout slots to a public layout root`, () => {
      const css = readFileSync(file, 'utf-8');
      const selectors = extractSelectors(css);

      const violations = selectors.filter((selector) => {
        const normalized = selector.replace(/:where\(([^()]*)\)/g, '$1');
        if (!broadLayoutSlotPattern.test(normalized)) return false;
        return !/\[data-slot="(topbar-layout|sidebar-layout)"\]/.test(
          normalized
        );
      });

      expect(
        violations,
        `Broad layout slots must be scoped by a public layout root: ${violations.join(', ')}`
      ).toEqual([]);
    });
  }
});

describe('tokens.css selector contract', () => {
  it('uses only :root and [data-theme] selectors', () => {
    const css = readFileSync(TOKENS_FILE, 'utf-8');
    const selectors = extractSelectors(css);

    for (const sel of selectors) {
      const isRoot = sel === ':root';
      const isRootNot = sel === ':root:not([data-theme])';
      const isDataTheme = sel.startsWith('[data-theme=');
      expect(
        isRoot || isRootNot || isDataTheme,
        `Unexpected selector in tokens.css: "${sel}"`
      ).toBe(true);
    }
  });
});
