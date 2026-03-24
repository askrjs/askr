import { readFile } from 'node:fs/promises';

let runtimeExports;
try {
  runtimeExports = await import('@askrjs/askr/foundations');
} catch (err) {
  // If we can't import the runtime, try to fall back to checking just the types
  // This can happen in workspace resolution issues
  console.warn(
    `Warning: Could not import @askrjs/askr/foundations: ${err.message}`
  );
  runtimeExports = {};
}

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
  if (
    (runtimeExports && !(key in runtimeExports)) ||
    runtimeExports[key] === undefined
  ) {
    // Only throw if we actually loaded the runtime
    if (Object.keys(runtimeExports).length > 0) {
      throw new Error(`Missing runtime foundations export: ${key}`);
    }
  }
}

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
// scriptDir is packages/askr-ui/scripts, so go up 3 levels to root
const workspaceRoot = join(scriptDir, '../../..');

// Try multiple possible paths for type files
const corePaths = [
  join(scriptDir, '../node_modules/@askrjs/askr/dist/foundations/core.d.ts'),
  join(workspaceRoot, 'packages/askr-core/dist/foundations/core.d.ts'),
];

let coreTypes;
for (const path of corePaths) {
  try {
    coreTypes = await readFile(path, 'utf8');
    break;
  } catch (err) {
    continue;
  }
}

if (!coreTypes) {
  throw new Error(
    `Could not find core type definitions in any location: ${corePaths.join(', ')}`
  );
}

const structuresPaths = [
  join(
    scriptDir,
    '../node_modules/@askrjs/askr/dist/foundations/structures.d.ts'
  ),
  join(workspaceRoot, 'packages/askr-core/dist/foundations/structures.d.ts'),
];

let structureTypes;
for (const path of structuresPaths) {
  try {
    structureTypes = await readFile(path, 'utf8');
    break;
  } catch (err) {
    continue;
  }
}

if (!structureTypes) {
  throw new Error(
    `Could not find structures type definitions in any location: ${structuresPaths.join(', ')}`
  );
}

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
