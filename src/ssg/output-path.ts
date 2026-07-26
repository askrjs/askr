import * as pathModule from 'node:path';

export function resolveSsgOutputPath(
  outputDir: string,
  filePath: string
): string {
  const root = pathModule.resolve(outputDir);
  const candidate = pathModule.resolve(root, filePath);
  const relative = pathModule.relative(root, candidate);
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${pathModule.sep}`) ||
    pathModule.isAbsolute(relative)
  ) {
    throw new Error(`SSG output path must stay inside outputDir: ${filePath}`);
  }
  return candidate;
}
