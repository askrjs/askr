import * as LucideIcons from 'lucide';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function toKebab(name) {
  return name.replace(/([A-Z])/g, (_, c, i) => (i > 0 ? `-${c}` : c)).toLowerCase();
}

export function iconFileContent(name, iconNode) {
  return (
    `// Generated - do not edit. Run \`npm run generate\` to update.\n` +
    `import { createIcon } from '../create-icon';\n\n` +
    `export const ${name} = createIcon('${name}', ${JSON.stringify(iconNode)});\n`
  );
}

export function indexEntry(name, kebab) {
  return `export { ${name} } from './icons/${kebab}';`;
}

export function indexPreamble() {
  return [
    `// Generated - do not edit. Run \`npm run generate\` to update.`,
    `export type { IconProps, IconNode, IconSizeToken } from './types';`,
    `export { createIcon } from './create-icon';`,
    ``,
  ].join('\n');
}

export function collectIcons() {
  const icons = [];
  for (const [name, value] of Object.entries(LucideIcons)) {
    if (!Array.isArray(value)) continue;
    icons.push({ name, kebab: toKebab(name), iconNode: value });
  }
  return icons;
}

export function generate() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const iconsDir = join(__dirname, '../src/icons');

  rmSync(iconsDir, { recursive: true, force: true });
  mkdirSync(iconsDir, { recursive: true });

  const icons = collectIcons();
  const indexLines = [indexPreamble()];

  for (const { name, kebab, iconNode } of icons) {
    writeFileSync(join(iconsDir, `${kebab}.ts`), iconFileContent(name, iconNode), 'utf8');
    indexLines.push(indexEntry(name, kebab));
  }

  const legacyGIndex = join(__dirname, '../src/index.g.ts');
  if (existsSync(legacyGIndex)) {
    rmSync(legacyGIndex, { force: true });
  }

  const legacyGeneratedIndex = join(__dirname, '../src/index.generated.ts');
  if (existsSync(legacyGeneratedIndex)) {
    rmSync(legacyGeneratedIndex, { force: true });
  }

  writeFileSync(join(__dirname, '../src/index.ts'), indexLines.join('\n') + '\n', 'utf8');
  return icons.length;
}

function isMain() {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMain()) {
  const count = generate();
  console.log(`Generated ${count} icons.`);
}
