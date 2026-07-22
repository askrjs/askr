import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = JSON.parse(
  execFileSync(npm, ['pack', '--ignore-scripts', '--dry-run', '--json'], {
    encoding: 'utf8',
  })
);

if (result.length !== 1) {
  throw new Error(`Expected one packed artifact, received ${result.length}.`);
}

const packedFiles = new Set(result[0].files.map(({ path }) => normalize(path)));
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
for (const [subpath, target] of Object.entries(packageJson.exports)) {
  if (!target || typeof target !== 'object' || !('types' in target)) continue;
  const declaration = normalize(target.types.replace(/^\.\//, ''));
  if (!packedFiles.has(declaration)) {
    throw new Error(
      `Packed artifact is missing ${declaration} for export ${subpath}`
    );
  }
}
const sourceMappingPattern = /[#@]\s*sourceMappingURL=([^\s*]+)/gu;

for (const file of result[0].files) {
  if (!/\.(?:css|d\.ts|js)$/u.test(file.path)) continue;

  const source = readFileSync(file.path, 'utf8');
  for (const match of source.matchAll(sourceMappingPattern)) {
    const reference = match[1];
    if (reference.startsWith('data:')) continue;
    if (/^[a-z][a-z\d+.-]*:/iu.test(reference)) {
      throw new Error(
        `${file.path} references external source map ${reference}.`
      );
    }

    const mapPath = normalize(
      join(dirname(file.path), decodeURIComponent(reference))
    );
    if (!packedFiles.has(mapPath)) {
      throw new Error(
        `${file.path} references missing packed source map ${mapPath}.`
      );
    }
  }
}
