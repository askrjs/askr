import * as fs from 'node:fs/promises';
import * as pathModule from 'node:path';
import type { SSGAssetSource } from './types';
import { foldPortablePathCase } from './unicode-case-fold';

const outputDirectoryQueues = new Map<string, Promise<void>>();

export async function withOutputDirectoryLock<T>(
  outputDir: string,
  operation: () => Promise<T>
): Promise<T> {
  const key = foldPortablePathCase(
    pathModule.resolve(outputDir).normalize('NFC').replaceAll('\\', '/')
  );
  const overlaps = (left: string, right: string) =>
    left === right ||
    left.startsWith(right.endsWith('/') ? right : `${right}/`);
  const previous = Promise.all(
    [...outputDirectoryQueues]
      .filter(([other]) => overlaps(key, other) || overlaps(other, key))
      .map(([, tail]) => tail.catch(() => undefined))
  );
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(
    () => current,
    () => current
  );
  outputDirectoryQueues.set(key, tail);

  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (outputDirectoryQueues.get(key) === tail) {
      outputDirectoryQueues.delete(key);
    }
  }
}

export async function createStagingDirectory(
  outputDir: string
): Promise<string> {
  const parent = pathModule.dirname(outputDir);
  const base = pathModule.basename(outputDir);
  await fs.mkdir(parent, { recursive: true });
  return fs.mkdtemp(pathModule.join(parent, `.${base}.askr-staging-`));
}

function resolveAssetDestination(
  outputDir: string,
  source: SSGAssetSource
): string {
  const relativeDestination = source.to ?? pathModule.basename(source.from);
  const destination = pathModule.resolve(outputDir, relativeDestination);
  const relative = pathModule.relative(
    pathModule.resolve(outputDir),
    destination
  );

  if (relative.startsWith('..') || pathModule.isAbsolute(relative)) {
    throw new Error(
      `SSG asset destination must stay inside outputDir: ${relativeDestination}`
    );
  }

  return destination;
}

interface AssetOutputEntry {
  path: string;
  directory: boolean;
}

function getPortableRelativePathKey(filePath: string): string {
  return foldPortablePathCase(filePath.replaceAll('\\', '/').normalize('NFC'));
}

function assetOutputConflictsWithFile(
  entry: AssetOutputEntry,
  generatedFilePath: string
): boolean {
  const assetKey = getPortableRelativePathKey(entry.path);
  const generatedKey = getPortableRelativePathKey(generatedFilePath);
  if (entry.directory) {
    return assetKey === generatedKey || assetKey.startsWith(`${generatedKey}/`);
  }
  return (
    assetKey === generatedKey ||
    assetKey.startsWith(`${generatedKey}/`) ||
    generatedKey.startsWith(`${assetKey}/`)
  );
}

async function collectAssetOutputEntries(
  sourcePath: string,
  destinationPath: string
): Promise<AssetOutputEntry[]> {
  const sourceInfo = await fs.lstat(sourcePath);
  if (!sourceInfo.isDirectory()) {
    return [{ path: destinationPath, directory: false }];
  }

  const entries: AssetOutputEntry[] = [
    { path: destinationPath, directory: true },
  ];
  for (const child of await fs.readdir(sourcePath, { withFileTypes: true })) {
    const childSourcePath = pathModule.join(sourcePath, child.name);
    const childDestinationPath = pathModule.join(destinationPath, child.name);
    if (child.isDirectory()) {
      entries.push(
        ...(await collectAssetOutputEntries(
          childSourcePath,
          childDestinationPath
        ))
      );
    } else {
      entries.push({ path: childDestinationPath, directory: false });
    }
  }
  return entries;
}

export async function validateAssetOutputCollisions(
  assets: readonly SSGAssetSource[] | undefined,
  outputDir: string,
  generatedFilePaths: readonly string[]
): Promise<void> {
  for (const source of assets ?? []) {
    if (!source.from || source.from.trim().length === 0) {
      throw new Error('SSG asset source requires a non-empty from path');
    }

    const sourcePath = pathModule.resolve(source.from);
    const destinationPath = resolveAssetDestination(outputDir, source);
    const entries = await collectAssetOutputEntries(
      sourcePath,
      pathModule.relative(pathModule.resolve(outputDir), destinationPath)
    );
    for (const entry of entries) {
      for (const generatedFilePath of generatedFilePaths) {
        if (assetOutputConflictsWithFile(entry, generatedFilePath)) {
          throw new Error(
            `SSG asset destination collision: "${entry.path}" overlaps generated file "${generatedFilePath}"`
          );
        }
      }
    }
  }
}

export async function copyStaticAssets(
  assets: readonly SSGAssetSource[] | undefined,
  outputDir: string
): Promise<void> {
  for (const source of assets ?? []) {
    if (!source.from || source.from.trim().length === 0) {
      throw new Error('SSG asset source requires a non-empty from path');
    }

    const from = pathModule.resolve(source.from);
    const to = resolveAssetDestination(outputDir, source);
    await fs.mkdir(pathModule.dirname(to), { recursive: true });
    await fs.cp(from, to, { recursive: true, force: true });
  }
}

type OutputDirectoryFileOperations = Pick<typeof fs, 'rename' | 'rm'>;

export async function replaceOutputDirectory(
  stagingDir: string,
  outputDir: string,
  fileOperations: OutputDirectoryFileOperations = fs
): Promise<void> {
  const parent = pathModule.dirname(outputDir);
  const backupDir = pathModule.join(
    parent,
    `.${pathModule.basename(outputDir)}.askr-backup-${Date.now()}`
  );
  let backedUp = false;
  let committed = false;
  let failed = false;
  let failure: unknown;

  try {
    try {
      await fileOperations.rename(outputDir, backupDir);
      backedUp = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    await fileOperations.rename(stagingDir, outputDir);
    committed = true;
    await fileOperations.rm(backupDir, { recursive: true, force: true });
  } catch (error) {
    failed = true;
    failure = error;
    // A failed replacement must leave the last complete site available.
    if (backedUp && !committed) {
      try {
        await fileOperations.rm(outputDir, { recursive: true, force: true });
        await fileOperations.rename(backupDir, outputDir);
      } catch {
        // Keep the initiating failure; a failed restore leaves the backup.
      }
    }
  }
  try {
    await fileOperations.rm(stagingDir, { recursive: true, force: true });
  } catch (error) {
    if (!failed) throw error;
  }
  if (failed) throw failure;
}
