/**
 * File I/O for Static Site Generation
 *
 * Uses Node.js fs/path modules to write rendered HTML files to disk.
 * This module is Node-only and not intended for browser builds.
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as pathModule from 'node:path';
import type { RouteRenderResult } from './types';

interface WriteStaticFilesOptions {
  concurrency?: number;
}

type StaticFileOperations = Pick<
  typeof fs,
  'mkdir' | 'readdir' | 'rename' | 'rm' | 'rmdir' | 'writeFile'
>;

/**
 * Write rendered routes to disk
 * Creates outputDir/{route-path}/index.html structure
 */
export async function writeStaticFiles(
  results: RouteRenderResult[],
  outputDir: string,
  options: WriteStaticFilesOptions = {},
  fileOperations: StaticFileOperations = fs
): Promise<void> {
  await fileOperations.mkdir(outputDir, { recursive: true });

  for (const result of results) {
    if (result.status !== 'removed') {
      continue;
    }

    const fullPath = pathModule.join(outputDir, result.filePath);
    if (fsSync.existsSync(fullPath)) {
      await fileOperations.rm(fullPath, { force: true });
      await pruneEmptyDirs(
        pathModule.dirname(fullPath),
        outputDir,
        fileOperations
      );
    }
  }

  const pendingWrites: RouteRenderResult[] = [];
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result.status === 'error') {
      console.warn(`Skipping failed route: ${result.path} - ${result.error}`);
      continue;
    }
    if (result.status === 'success' && result.written) {
      pendingWrites.push(result);
    }
  }

  const directories: string[] = [];
  const seenDirectories = new Set<string>();
  for (const result of pendingWrites) {
    const dir = pathModule.dirname(pathModule.join(outputDir, result.filePath));
    if (!seenDirectories.has(dir)) {
      seenDirectories.add(dir);
      directories.push(dir);
    }
  }

  for (const dir of directories) {
    await fileOperations.mkdir(dir, { recursive: true });
  }

  const concurrency = Math.max(
    1,
    Math.min(options.concurrency ?? 8, pendingWrites.length || 1)
  );
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;
      if (current >= pendingWrites.length) {
        return;
      }

      const result = pendingWrites[current];
      const fullPath = pathModule.join(outputDir, result.filePath);
      // Incremental output is observable while a generation is running. Write
      // the complete replacement beside the live file, then publish it with
      // rename so a failed write cannot truncate the prior route HTML.
      const tempPath = pathModule.join(
        pathModule.dirname(fullPath),
        `.${pathModule.basename(fullPath)}.askr-${process.pid}-${current}.tmp`
      );
      try {
        await fileOperations.writeFile(tempPath, result.html, 'utf8');
        await fileOperations.rename(tempPath, fullPath);
      } finally {
        await fileOperations.rm(tempPath, { force: true });
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

/**
 * Get the output file path for a route
 * E.g., "/blog/post" -> "blog/post" or "/" -> ""
 */
export { getOutputFilePath } from './route-utils';

async function pruneEmptyDirs(
  startDir: string,
  rootDir: string,
  fileOperations: Pick<StaticFileOperations, 'readdir' | 'rmdir'>
): Promise<void> {
  let current = startDir;
  const normalizedRoot = pathModule.resolve(rootDir);

  while (current.startsWith(normalizedRoot)) {
    if (!fsSync.existsSync(current)) {
      break;
    }

    if ((await fileOperations.readdir(current)).length > 0) {
      break;
    }

    await fileOperations.rmdir(current);
    if (pathModule.resolve(current) === normalizedRoot) {
      break;
    }
    current = pathModule.dirname(current);
  }
}
