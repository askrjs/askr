import { readFile } from 'node:fs/promises';

const runtimeExports = await import('@askrjs/askr/foundations');
const runtimeKeys = [
  'Presence',
  'pressable',
  'focusable',
  'dismissable',
  'rovingFocus',
  'mergeProps',
  'composeRefs',
  'controllableState',
];

for (const key of runtimeKeys) {
  if (!(key in runtimeExports) || runtimeExports[key] === undefined) {
    throw new Error(`Missing runtime foundations export: ${key}`);
  }
}

const coreTypes = await readFile(
  new URL(
    '../node_modules/@askrjs/askr/dist/foundations/core.d.ts',
    import.meta.url
  ),
  'utf8'
);

const structureTypes = await readFile(
  new URL(
    '../node_modules/@askrjs/askr/dist/foundations/structures.d.ts',
    import.meta.url
  ),
  'utf8'
);

const typeMarkers = [
  ['Ref', coreTypes],
  ['Orientation', coreTypes],
  ['Presence', structureTypes],
];

for (const [marker, source] of typeMarkers) {
  if (!source.includes(marker)) {
    throw new Error(`Missing type foundations export marker: ${marker}`);
  }
}

process.stdout.write('Foundations contract verified.\n');
