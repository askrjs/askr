import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uiRoot = path.resolve(__dirname, '..');
const themesRoot = path.resolve(uiRoot, '..', 'askr-themes');

const UI_COMPONENTS_DIR = path.join(uiRoot, 'src', 'components');
const THEMES_DEFAULT_INDEX_CSS = path.join(
  themesRoot,
  'src',
  'themes',
  'default',
  'index.css'
);
const THEMES_TEMPLATE_INDEX_CSS = path.join(
  themesRoot,
  'templates',
  'theme',
  'index.css'
);
const CHECKS_DIR = path.join(uiRoot, 'checks');
const REPORT_JSON_PATH = path.join(CHECKS_DIR, 'theme-contract-report.json');
const REPORT_MD_PATH = path.join(CHECKS_DIR, 'theme-contract-report.md');
const ALLOWED_THEME_ONLY_ATTRS = new Set(['data-theme']);

function walkFiles(dirPath, extensions, output = []) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, extensions, output);
      continue;
    }
    if (extensions.includes(path.extname(entry.name))) {
      output.push(fullPath);
    }
  }
  return output;
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

function extractStringLiterals(expression) {
  const values = new Set();
  const stringLiteral = /(['"])((?:\\.|(?!\1).)*)\1/g;
  let match;
  while ((match = stringLiteral.exec(expression))) {
    values.add(match[2]);
  }
  return values;
}

function collectUiDataHooks() {
  const files = walkFiles(UI_COMPONENTS_DIR, ['.tsx']);
  const attrs = new Map();

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relative = normalizePath(path.relative(uiRoot, filePath));

    const propPattern = /(['"])data-([a-z0-9-]+)\1\s*:\s*([^,}\n]+)/gi;
    let match;

    while ((match = propPattern.exec(content))) {
      const attrName = `data-${match[2]}`;
      const expr = match[3].trim();
      const rawValues = extractStringLiterals(expr);

      if (!attrs.has(attrName)) {
        attrs.set(attrName, {
          attr: attrName,
          values: new Set(),
          hasPresenceUsage: false,
          files: new Set(),
        });
      }

      const entry = attrs.get(attrName);
      entry.files.add(relative);

      if (rawValues.size === 0) {
        entry.hasPresenceUsage = true;
      } else {
        for (const value of rawValues) {
          if (value !== 'undefined' && value !== 'null') {
            entry.values.add(value);
          }
        }
      }
    }
  }

  return attrs;
}

function collectThemeSelectorsFromFiles(files, sourceLabel) {
  const attrs = new Map();

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relative = normalizePath(path.relative(themesRoot, filePath));

    const selectorAttrPattern =
      /\[data-([a-z0-9-]+)(?:\s*=\s*(['"]?)([^\]"']+)\2)?\]/gi;
    let match;

    while ((match = selectorAttrPattern.exec(content))) {
      const attrName = `data-${match[1]}`;
      const explicitValue = match[3]?.trim();

      if (!attrs.has(attrName)) {
        attrs.set(attrName, {
          attr: attrName,
          values: new Set(),
          hasPresenceSelector: false,
          selectors: new Set(),
          files: new Set(),
          source: sourceLabel,
        });
      }

      const entry = attrs.get(attrName);
      entry.files.add(relative);
      entry.selectors.add(match[0]);

      if (explicitValue) {
        entry.values.add(explicitValue);
      } else {
        entry.hasPresenceSelector = true;
      }
    }
  }

  return attrs;
}

function resolveImportedCssFiles(indexCssPath) {
  const indexDir = path.dirname(indexCssPath);
  const content = fs.readFileSync(indexCssPath, 'utf8');
  const importPattern = /@import\s+["']([^"']+\.css)["'];?/g;
  const resolved = [];
  let match;

  while ((match = importPattern.exec(content))) {
    const importPath = match[1];
    const fullPath = path.resolve(indexDir, importPath);
    if (fs.existsSync(fullPath)) {
      resolved.push(fullPath);
    }
  }

  return resolved;
}

function mergeSelectorMaps(leftMap, rightMap) {
  const merged = new Map(leftMap);

  for (const [attrName, right] of rightMap) {
    if (!merged.has(attrName)) {
      merged.set(attrName, right);
      continue;
    }

    const left = merged.get(attrName);
    for (const value of right.values) left.values.add(value);
    for (const file of right.files) left.files.add(file);
    for (const selector of right.selectors) left.selectors.add(selector);
    left.hasPresenceSelector =
      left.hasPresenceSelector || right.hasPresenceSelector;
    left.source = `${left.source},${right.source}`;
  }

  return merged;
}

function mapToSerializable(map) {
  const output = [];
  for (const [, value] of map) {
    output.push({
      attr: value.attr,
      values: [...value.values].sort(),
      files: [...value.files].sort(),
      hasPresenceUsage: Boolean(value.hasPresenceUsage),
      hasPresenceSelector: Boolean(value.hasPresenceSelector),
      selectors: value.selectors ? [...value.selectors].sort() : undefined,
      source: value.source,
    });
  }
  return output.sort((a, b) => a.attr.localeCompare(b.attr));
}

function analyze(uiHooks, themeHooks) {
  const uiAttrs = new Set(uiHooks.keys());
  const themeAttrs = new Set(themeHooks.keys());

  const onlyInUi = [...uiAttrs].filter((attr) => !themeAttrs.has(attr)).sort();
  const onlyInThemes = [...themeAttrs]
    .filter(
      (attr) => !uiAttrs.has(attr) && !ALLOWED_THEME_ONLY_ATTRS.has(attr)
    )
    .sort();

  const valueMismatches = [];

  for (const attr of [...uiAttrs].filter((candidate) => themeAttrs.has(candidate))) {
    const ui = uiHooks.get(attr);
    const theme = themeHooks.get(attr);

    const uiValues = ui.values;
    const themeValues = theme.values;

    const valuesOnlyInUi = [...uiValues]
      .filter((value) => !themeValues.has(value))
      .sort();
    const valuesOnlyInThemes = [...themeValues]
      .filter((value) => !uiValues.has(value))
      .sort();

    if (valuesOnlyInUi.length === 0 && valuesOnlyInThemes.length === 0) {
      continue;
    }

    if (uiValues.size === 0 && ui.hasPresenceUsage) {
      continue;
    }

    const hasPresenceBridge =
      theme.hasPresenceSelector && uiValues.size > 0 && valuesOnlyInUi.length === uiValues.size;

    if (!hasPresenceBridge) {
      valueMismatches.push({
        attr,
        valuesOnlyInUi,
        valuesOnlyInThemes,
        uiFiles: [...ui.files].sort(),
        themeFiles: [...theme.files].sort(),
      });
    }
  }

  return {
    onlyInUi,
    onlyInThemes,
    valueMismatches,
  };
}

function countStrictBlockers(analysis) {
  let mismatchBlockers = 0;
  for (const mismatch of analysis.valueMismatches) {
    if (mismatch.valuesOnlyInThemes.length > 0) {
      mismatchBlockers += 1;
    }
  }

  return analysis.onlyInUi.length + analysis.onlyInThemes.length + mismatchBlockers;
}

function reportToMarkdown(summary) {
  const lines = [];

  lines.push('# Theme Contract Audit');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push(`- UI hooks discovered: ${summary.uiHookCount}`);
  lines.push(`- Theme hooks discovered: ${summary.themeHookCount}`);
  lines.push(`- Attrs only in UI: ${summary.analysis.onlyInUi.length}`);
  lines.push(`- Attrs only in Themes: ${summary.analysis.onlyInThemes.length}`);
  lines.push(`- Value mismatches: ${summary.analysis.valueMismatches.length}`);
  lines.push('');

  lines.push('## Attrs Only In UI');
  lines.push('');
  if (summary.analysis.onlyInUi.length === 0) {
    lines.push('- None');
  } else {
    for (const attr of summary.analysis.onlyInUi) {
      lines.push(`- ${attr}`);
    }
  }
  lines.push('');

  lines.push('## Attrs Only In Themes');
  lines.push('');
  if (summary.analysis.onlyInThemes.length === 0) {
    lines.push('- None');
  } else {
    for (const attr of summary.analysis.onlyInThemes) {
      lines.push(`- ${attr}`);
    }
  }
  lines.push('');

  lines.push('## Value Mismatches');
  lines.push('');
  if (summary.analysis.valueMismatches.length === 0) {
    lines.push('- None');
  } else {
    for (const mismatch of summary.analysis.valueMismatches) {
      lines.push(`- ${mismatch.attr}`);
      if (mismatch.valuesOnlyInUi.length > 0) {
        lines.push(`  - values only in UI: ${mismatch.valuesOnlyInUi.join(', ')}`);
      }
      if (mismatch.valuesOnlyInThemes.length > 0) {
        lines.push(
          `  - values only in Themes: ${mismatch.valuesOnlyInThemes.join(', ')}`
        );
      }
    }
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function ensureChecksDir() {
  fs.mkdirSync(CHECKS_DIR, { recursive: true });
}

function printConsoleSummary(summary) {
  process.stdout.write('Theme contract audit completed.\n');
  process.stdout.write(`UI hooks discovered: ${summary.uiHookCount}\n`);
  process.stdout.write(`Theme hooks discovered: ${summary.themeHookCount}\n`);
  process.stdout.write(
    `Attrs only in UI: ${summary.analysis.onlyInUi.length}\n`
  );
  process.stdout.write(
    `Attrs only in Themes: ${summary.analysis.onlyInThemes.length}\n`
  );
  process.stdout.write(
    `Value mismatches: ${summary.analysis.valueMismatches.length}\n`
  );
  process.stdout.write(
    `Strict blockers: ${countStrictBlockers(summary.analysis)}\n`
  );
}

function run() {
  if (!fs.existsSync(UI_COMPONENTS_DIR)) {
    throw new Error(`Missing askr-ui components directory: ${UI_COMPONENTS_DIR}`);
  }
  if (!fs.existsSync(THEMES_DEFAULT_INDEX_CSS)) {
    throw new Error(
      `Missing askr-themes default theme index: ${THEMES_DEFAULT_INDEX_CSS}`
    );
  }
  if (!fs.existsSync(THEMES_TEMPLATE_INDEX_CSS)) {
    throw new Error(
      `Missing askr-themes template index: ${THEMES_TEMPLATE_INDEX_CSS}`
    );
  }

  const uiHooks = collectUiDataHooks();
  const defaultThemeFiles = resolveImportedCssFiles(THEMES_DEFAULT_INDEX_CSS);
  const templateThemeFiles = resolveImportedCssFiles(THEMES_TEMPLATE_INDEX_CSS);

  const defaultThemeHooks = collectThemeSelectorsFromFiles(
    defaultThemeFiles,
    'default'
  );
  const templateThemeHooks = collectThemeSelectorsFromFiles(
    templateThemeFiles,
    'template'
  );
  const allThemeHooks = mergeSelectorMaps(defaultThemeHooks, templateThemeHooks);

  const analysis = analyze(uiHooks, allThemeHooks);

  const summary = {
    generatedAt: new Date().toISOString(),
    uiRoot: normalizePath(uiRoot),
    themesRoot: normalizePath(themesRoot),
    uiHookCount: uiHooks.size,
    themeHookCount: allThemeHooks.size,
    defaultThemeFileCount: defaultThemeFiles.length,
    templateThemeFileCount: templateThemeFiles.length,
    analysis,
    uiHooks: mapToSerializable(uiHooks),
    themeHooks: mapToSerializable(allThemeHooks),
  };

  printConsoleSummary(summary);

  if (process.argv.includes('--write-report')) {
    ensureChecksDir();
    fs.writeFileSync(
      REPORT_JSON_PATH,
      `${JSON.stringify(summary, null, 2)}\n`,
      'utf8'
    );
    fs.writeFileSync(REPORT_MD_PATH, reportToMarkdown(summary), 'utf8');

    process.stdout.write(
      `Report JSON: ${normalizePath(path.relative(uiRoot, REPORT_JSON_PATH))}\n`
    );
    process.stdout.write(
      `Report MD: ${normalizePath(path.relative(uiRoot, REPORT_MD_PATH))}\n`
    );
  }

  if (process.argv.includes('--strict')) {
    const failureCount = countStrictBlockers(analysis);
    if (failureCount > 0) {
      process.stderr.write(`Strict mode failed with ${failureCount} finding(s).\n`);
      process.exitCode = 1;
    }
  }
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
