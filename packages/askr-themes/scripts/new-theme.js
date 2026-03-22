import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const THEME_NAME_RE = /^[a-z0-9-]+$/;

function printUsage() {
  console.log('Usage: npm run new:theme -- <theme-name>');
  console.log('Example: npm run new:theme -- ocean');
}

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function replacePlaceholdersInCssFiles(dirPath, themeName) {
  const files = [
    'tokens.css',
    path.join('components', 'button.css'),
    'index.css',
  ];

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const content = await readFile(filePath, 'utf8');
    const updated = content.replaceAll('__THEME_NAME__', themeName);
    await writeFile(filePath, updated, 'utf8');
  }
}

async function main() {
  const themeName = process.argv[2]?.trim();

  if (!themeName) {
    printUsage();
    process.exit(1);
  }

  if (!THEME_NAME_RE.test(themeName)) {
    console.error('Theme name must match /^[a-z0-9-]+$/.');
    process.exit(1);
  }

  const root = process.cwd();
  const templateDir = path.join(root, 'templates', 'theme');
  const outputDir = path.join(root, 'src', 'themes', themeName);

  if (!(await pathExists(templateDir))) {
    console.error('Missing templates/theme directory.');
    process.exit(1);
  }

  if (await pathExists(outputDir)) {
    console.error(`Theme already exists: ${themeName}`);
    process.exit(1);
  }

  await mkdir(path.dirname(outputDir), { recursive: true });
  await cp(templateDir, outputDir, { recursive: true });
  await replacePlaceholdersInCssFiles(outputDir, themeName);

  console.log(`Created theme at src/themes/${themeName}`);
  console.log(
    'Next step: add exports in package.json for your new theme entrypoints.'
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
