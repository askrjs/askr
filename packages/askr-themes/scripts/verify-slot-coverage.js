/**
 * Verify that every data-slot value emitted by askr-ui components
 * has corresponding CSS coverage in the default theme.
 *
 * Expects askr-ui to be a sibling directory (../askr-ui).
 * Exit code 1 if uncovered or stale slots are found.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const themesRoot = path.resolve(__dirname, '..');
const uiRoot = path.resolve(themesRoot, '..', 'askr-ui');

const UI_COMPONENTS_DIR = path.join(uiRoot, 'src', 'components');
const THEMES_COMPONENTS_DIR = path.join(
  themesRoot,
  'src',
  'themes',
  'default',
  'components'
);
const ALLOWED_THEME_ONLY_SLOTS = new Set(['icon']);

function walkFiles(dirPath, extensions) {
  const normalizedExtensions = Array.isArray(extensions)
    ? extensions
    : [extensions];
  const results = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath, extensions));
    } else if (
      normalizedExtensions.some((extension) => entry.name.endsWith(extension))
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

function extractUiSlots() {
  if (!fs.existsSync(UI_COMPONENTS_DIR)) {
    console.error(
      `askr-ui components not found at ${UI_COMPONENTS_DIR}.\n` +
        'Ensure askr-ui is a sibling directory.'
    );
    process.exit(1);
  }

  const slots = new Set();
  const files = walkFiles(UI_COMPONENTS_DIR, ['.ts', '.tsx']);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const patterns = [
      /['"]data-slot['"]\s*:\s*['"]([^'"]+)['"]/g,
      /data-slot="([^"]+)"/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content))) {
        slots.add(match[1]);
      }
    }

    const slotBlockPatterns = [
      /SLOTS\s*:\s*\{([\s\S]*?)\n\s*\}(?:\s*,|\s*as const)?/g,
      /const\s+SLOTS\s*=\s*\{([\s\S]*?)\n\s*\}(?:\s*as const)?/g,
    ];

    for (const blockPattern of slotBlockPatterns) {
      let blockMatch;
      while ((blockMatch = blockPattern.exec(content))) {
        for (const valueMatch of blockMatch[1].matchAll(
          /:\s*['"]([^'"]+)['"](?:\s+as const)?/g
        )) {
          slots.add(valueMatch[1]);
        }
      }
    }
  }

  return slots;
}

function extractThemeSlots() {
  const slots = new Set();
  const files = walkFiles(THEMES_COMPONENTS_DIR, '.css');

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const pattern = /\[data-slot=['"]([^'"]+)['"]\]/g;
    let match;
    while ((match = pattern.exec(content))) {
      slots.add(match[1]);
    }
  }

  return slots;
}

function run() {
  const uiSlots = extractUiSlots();
  const themeSlots = extractThemeSlots();

  const uncovered = [...uiSlots].filter((s) => !themeSlots.has(s)).sort();
  const themeOnly = [...themeSlots]
    .filter((s) => !uiSlots.has(s) && !ALLOWED_THEME_ONLY_SLOTS.has(s))
    .sort();

  console.log(`UI slots:    ${uiSlots.size}`);
  console.log(`Theme slots: ${themeSlots.size}`);
  console.log(`Uncovered:   ${uncovered.length}`);
  console.log(`Theme-only:  ${themeOnly.length}`);

  if (uncovered.length > 0) {
    console.log('\nUncovered slots (in askr-ui but not in theme):');
    for (const slot of uncovered) {
      console.log(`  - ${slot}`);
    }
  }

  if (themeOnly.length > 0) {
    console.log('\nTheme-only slots (in theme but not in askr-ui):');
    for (const slot of themeOnly) {
      console.log(`  - ${slot}`);
    }
  }

  if (uncovered.length > 0 || themeOnly.length > 0) {
    process.exitCode = 1;
  }
}

run();
