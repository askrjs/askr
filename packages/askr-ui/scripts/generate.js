import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CATEGORY_GROUPS = [
  {
    name: 'foundation',
    components: [
      'button',
      'checkbox',
      'field',
      'input',
      'label',
      'radio-group',
      'select',
      'separator',
      'slider',
      'switch',
      'textarea',
      'toggle',
      'toggle-group',
      'visually-hidden',
    ],
  },
  {
    name: 'focus',
    components: ['dismissable-layer', 'focus-ring', 'focus-scope'],
  },
  {
    name: 'overlay',
    components: [
      'alert-dialog',
      'dialog',
      'dropdown-menu',
      'menu',
      'popover',
      'tooltip',
    ],
  },
  {
    name: 'disclosure',
    components: ['accordion', 'collapsible', 'tabs'],
  },
  {
    name: 'status',
    components: ['badge', 'progress', 'progress-circle', 'skeleton', 'spinner', 'toast'],
  },
  {
    name: 'identity',
    components: ['avatar'],
  },
  {
    name: 'navigation',
    components: ['breadcrumb', 'menubar', 'navigation-menu', 'pagination'],
  },
  {
    name: 'layout',
    components: [
      'center',
      'container',
      'data-table',
      'grid',
      'inline',
      'sidebar-layout',
      'spacer',
      'stack',
      'topbar-layout',
    ],
  },
];

function collectComponentNames() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const componentsDir = join(__dirname, '../src/components');

  return readdirSync(componentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== '_internal')
    .filter((entry) => existsSync(join(componentsDir, entry.name, 'index.ts')))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function createComponentExport(name) {
  const basePath = `./dist/components/${name}/${name}`;
  return {
    types: `${basePath}.d.ts`,
    import: `${basePath}.js`,
    require: `${basePath}.cjs`,
  };
}

function createCategoryExport(name) {
  const basePath = `./dist/categories/${name}/index`;
  return {
    types: `${basePath}.d.ts`,
    import: `${basePath}.js`,
    require: `${basePath}.cjs`,
  };
}

function generateComponentsIndex(componentNames) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const indexPath = join(__dirname, '../src/components/index.ts');
  const lines = [
    '// Generated - do not edit. Run `npm run generate` to update.',
    '',
  ];

  for (const name of componentNames) {
    lines.push(`export * from './${name}';`);
  }

  lines.push('');
  writeFileSync(indexPath, `${lines.join('\n')}`, 'utf8');
}

function generateCategoryEntries() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const categoriesDir = join(__dirname, '../src/categories');
  mkdirSync(categoriesDir, { recursive: true });

  const registryLines = [
    '// Generated - do not edit. Run `npm run generate` to update.',
    '',
    "import './foundation';",
    "import './focus';",
    "import './overlay';",
    "import './disclosure';",
    "import './status';",
    "import './identity';",
    "import './navigation';",
    "import './layout';",
    '',
  ];

  for (const category of CATEGORY_GROUPS) {
    const categoryDir = join(categoriesDir, category.name);
    mkdirSync(categoryDir, { recursive: true });

    const lines = [
      '// Generated - do not edit. Run `npm run generate` to update.',
      '',
    ];

    for (const component of category.components) {
      lines.push(`export * from '../../components/${component}';`);
    }

    lines.push('');
    writeFileSync(join(categoryDir, 'index.ts'), `${lines.join('\n')}`, 'utf8');
  }

  writeFileSync(
    join(categoriesDir, 'index.ts'),
    `${registryLines.join('\n')}`,
    'utf8'
  );
}

function generatePackageJson(componentNames) {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const packageJsonPath = join(__dirname, '../package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const exportsMap = {
    '.': packageJson.exports['.'],
  };

  for (const category of CATEGORY_GROUPS) {
    exportsMap[`./${category.name}`] = createCategoryExport(category.name);
  }

  for (const name of componentNames) {
    exportsMap[`./${name}`] = createComponentExport(name);
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
  const componentNames = collectComponentNames();
  generateCategoryEntries();
  generateComponentsIndex(componentNames);
  generatePackageJson(componentNames);
  return componentNames.length;
}

if (process.argv[1]) {
  const invokedPath = fileURLToPath(import.meta.url);
  if (process.argv[1] === invokedPath) {
    const count = generate();
    console.log(`Generated ${count} component entries.`);
  }
}
