import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COMPONENT_REGISTRY = [
  { name: 'avatar', bucket: 'primitives' },
  { name: 'badge', bucket: 'primitives' },
  { name: 'button', bucket: 'primitives' },
  { name: 'center', bucket: 'primitives' },
  { name: 'checkbox', bucket: 'primitives' },
  { name: 'container', bucket: 'primitives' },
  { name: 'grid', bucket: 'primitives' },
  { name: 'inline', bucket: 'primitives' },
  { name: 'input', bucket: 'primitives' },
  { name: 'label', bucket: 'primitives' },
  { name: 'progress', bucket: 'primitives' },
  { name: 'progress-circle', bucket: 'primitives' },
  { name: 'radio-group', bucket: 'primitives' },
  { name: 'select', bucket: 'primitives' },
  { name: 'separator', bucket: 'primitives' },
  { name: 'skeleton', bucket: 'primitives' },
  { name: 'slider', bucket: 'primitives' },
  { name: 'spacer', bucket: 'primitives' },
  { name: 'spinner', bucket: 'primitives' },
  { name: 'stack', bucket: 'primitives' },
  { name: 'switch', bucket: 'primitives' },
  { name: 'textarea', bucket: 'primitives' },
  { name: 'toggle', bucket: 'primitives' },
  { name: 'toggle-group', bucket: 'primitives' },
  { name: 'visually-hidden', bucket: 'primitives' },
  { name: 'accordion', bucket: 'composites' },
  { name: 'alert-dialog', bucket: 'composites' },
  { name: 'breadcrumb', bucket: 'composites' },
  { name: 'collapsible', bucket: 'composites' },
  { name: 'dialog', bucket: 'composites' },
  { name: 'dismissable-layer', bucket: 'composites' },
  { name: 'dropdown-menu', bucket: 'composites' },
  { name: 'field', bucket: 'composites' },
  { name: 'focus-ring', bucket: 'composites' },
  { name: 'focus-scope', bucket: 'composites' },
  { name: 'menu', bucket: 'composites' },
  { name: 'menubar', bucket: 'composites' },
  { name: 'navigation-menu', bucket: 'composites' },
  { name: 'pagination', bucket: 'composites' },
  { name: 'popover', bucket: 'composites' },
  { name: 'tabs', bucket: 'composites' },
  { name: 'toast', bucket: 'composites' },
  { name: 'tooltip', bucket: 'composites' },
  { name: 'data-table', bucket: 'patterns' },
  { name: 'sidebar-layout', bucket: 'patterns' },
  { name: 'topbar-layout', bucket: 'patterns' },
];

const EXPORT_PATTERNS = [
  {
    key: './primitives/*',
    basePath: './dist/components/primitives/*/*',
  },
  {
    key: './composites/field/*',
    basePath: './dist/components/composites/field/*',
  },
  {
    key: './composites/*',
    basePath: './dist/components/composites/*/*',
  },
  {
    key: './patterns/*',
    basePath: './dist/components/patterns/*/*',
  },
];

function validateRegistry() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const componentsDir = join(__dirname, '../src/components');

  for (const component of COMPONENT_REGISTRY) {
    const componentIndexPath = join(
      componentsDir,
      component.bucket,
      component.name,
      'index.ts'
    );

    if (!existsSync(componentIndexPath)) {
      throw new Error(`Missing component entrypoint: ${componentIndexPath}`);
    }
  }
}

function createDistExport(basePath) {
  return {
    types: `${basePath}.d.ts`,
    import: `${basePath}.js`,
    require: `${basePath}.cjs`,
  };
}

function generateComponentsIndex() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const indexPath = join(__dirname, '../src/components/index.ts');
  const lines = [
    '// Generated - do not edit. Run `npm run generate` to update.',
    '',
  ];

  for (const component of COMPONENT_REGISTRY) {
    lines.push(`export * from './${component.bucket}/${component.name}';`);
  }

  lines.push('');
  writeFileSync(indexPath, `${lines.join('\n')}`, 'utf8');
}

function removeCategoriesDirectory() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const categoriesDir = join(__dirname, '../src/categories');
  rmSync(categoriesDir, { force: true, recursive: true });
}

function generatePackageJson() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = join(__dirname, '../package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const exportsMap = {
    '.': packageJson.exports['.'],
  };

  for (const exportPattern of EXPORT_PATTERNS) {
    exportsMap[exportPattern.key] = createDistExport(exportPattern.basePath);
  }

  exportsMap['./package.json'] = './package.json';
  packageJson.exports = exportsMap;
  packageJson.scripts = {
    ...packageJson.scripts,
    generate: 'node scripts/generate.js',
  };
  writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8'
  );
}

export function generate() {
  validateRegistry();
  removeCategoriesDirectory();
  generateComponentsIndex();
  generatePackageJson();
  return COMPONENT_REGISTRY.length;
}

if (process.argv[1]) {
  const invokedPath = fileURLToPath(import.meta.url);
  if (process.argv[1] === invokedPath) {
    const count = generate();
    console.log(`Generated ${count} component entries.`);
  }
}
