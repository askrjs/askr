import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const responsiveContractThemes = ['default'];
const forbiddenLegacyImports = [
  './components/app-shell.css',
  './components/navbar.css',
  './components/sidebar.css',
  './components/dashboard-layout.css',
  './components/docs-layout.css',
];
const defaultPatternImports = [
  './components/responsive-layout.css',
  './components/data-table.css',
];

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

async function main() {
  const defaultResponsive = await read(
    'src/themes/default/components/responsive-layout.css'
  );
  const templateResponsive = await read(
    'templates/theme/components/responsive-layout.css'
  );
  const theming = await read('THEMING.md');

  const responsiveImportPattern =
    /@import\s+['"]\.\/components\/responsive-layout\.css['"];?/;
  for (const theme of responsiveContractThemes) {
    const indexCss = await read(`src/themes/${theme}/index.css`);
    if (!responsiveImportPattern.test(indexCss)) {
      throw new Error(
        `${theme} theme is missing responsive-layout.css import.`
      );
    }

    for (const forbiddenImport of forbiddenLegacyImports) {
      if (indexCss.includes(forbiddenImport)) {
        throw new Error(
          `${theme} theme still imports legacy layout CSS: ${forbiddenImport}`
        );
      }
    }

    const responsiveCss = await read(
      `src/themes/${theme}/components/responsive-layout.css`
    );
    if (responsiveCss !== defaultResponsive) {
      throw new Error(
        `${theme} responsive layout CSS is out of sync with default.`
      );
    }
  }

  const templateIndex = await read('templates/theme/index.css');
  if (!responsiveImportPattern.test(templateIndex)) {
    throw new Error('Theme template is missing responsive-layout.css import.');
  }

  for (const forbiddenImport of forbiddenLegacyImports) {
    if (templateIndex.includes(forbiddenImport)) {
      throw new Error(
        `Theme template still imports legacy layout CSS: ${forbiddenImport}`
      );
    }
  }

  const defaultIndex = await read('src/themes/default/index.css');
  for (const requiredImport of defaultPatternImports) {
    if (!defaultIndex.includes(requiredImport)) {
      throw new Error(
        `Default theme is missing required pattern import: ${requiredImport}`
      );
    }

    if (!templateIndex.includes(requiredImport)) {
      throw new Error(
        `Theme template is missing required pattern import: ${requiredImport}`
      );
    }
  }

  const requiredResponsiveSnippets = [
    ':where([data-slot="topbar-layout"])',
    ':where([data-slot="sidebar-layout"])',
    ':where([data-slot="topbar-layout"]) > :where([data-slot="navbar"])',
    ':where([data-slot="sidebar-layout"]) > :where([data-slot="sidebar"])',
    ':where([data-slot="container"][data-size="lg"])',
    ':where([data-slot="container"][data-max-width="xl"])',
    '@media (min-width: 40rem)',
    '@media (min-width: 48rem)',
    '@media (min-width: 64rem)',
    '@media (min-width: 80rem)',
  ];

  const normalizedResponsive = defaultResponsive.replace(/'/g, '"');

  for (const snippet of requiredResponsiveSnippets) {
    if (!normalizedResponsive.includes(snippet)) {
      throw new Error(`Default responsive layout CSS is missing: ${snippet}`);
    }
  }

  if (defaultResponsive !== templateResponsive) {
    throw new Error(
      'Template responsive layout CSS is out of sync with the default theme.'
    );
  }

  const requiredDocs = [
    'Build mobile first.',
    '`sm`, `md`, `lg`, and `xl`',
    '`data-collapse-below`',
    '`data-min-item-width`',
    '`data-size`',
    '`:where(...)`',
  ];

  for (const snippet of requiredDocs) {
    if (!theming.includes(snippet)) {
      throw new Error(`THEMING.md is missing responsive guidance: ${snippet}`);
    }
  }

  console.log('Responsive theme contract verified.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
