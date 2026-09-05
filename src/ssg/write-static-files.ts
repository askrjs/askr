/**
 * File I/O for Static Site Generation
 *
 * Uses Node.js fs/path modules to write rendered HTML files to disk.
 * This module is Node-only and not intended for browser builds.
 */

import * as fs from 'node:fs/promises';
import * as pathModule from 'node:path';
import type { RouteRenderResult } from './types';
import { resolveSsgOutputPath } from './output-path';

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

    const fullPath = resolveSsgOutputPath(outputDir, result.filePath);
    await fileOperations.rm(fullPath, { force: true });
    await pruneEmptyDirs(
      pathModule.dirname(fullPath),
      outputDir,
      fileOperations
    );
  }

  const pendingWrites: RouteRenderResult[] = [];
  const reportedErrors = new Set<string>();
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result.status === 'error') {
      const diagnostic = `Skipping failed route: ${result.path} - ${result.error}`;
      if (!reportedErrors.has(diagnostic)) {
        reportedErrors.add(diagnostic);
        console.warn(diagnostic);
      }
      continue;
    }
    if (result.status === 'success' && result.written) {
      pendingWrites.push(result);
    }
  }

  const directories: string[] = [];
  const seenDirectories = new Set<string>();
  for (const result of pendingWrites) {
    const dir = pathModule.dirname(
      resolveSsgOutputPath(outputDir, result.filePath)
    );
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
  let failed = false;
  let failure: unknown;
  const recordFailure = (error: unknown) => {
    if (!failed) {
      failed = true;
      failure = error;
    }
  };

  const worker = async () => {
    try {
      while (!failed) {
        const current = nextIndex;
        nextIndex += 1;
        if (current >= pendingWrites.length) {
          return;
        }

        const result = pendingWrites[current];
        const fullPath = resolveSsgOutputPath(outputDir, result.filePath);
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
        } catch (error) {
          recordFailure(error);
        } finally {
          try {
            await fileOperations.rm(tempPath, { force: true });
          } catch (error) {
            recordFailure(error);
          }
        }
      }
    } catch (error) {
      // Live result records can change between directory preparation and a
      // worker claiming them. Preparation failures must drain started writes.
      recordFailure(error);
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (failed) throw failure;
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

  while (pathModule.resolve(current) !== normalizedRoot) {
    const relative = pathModule.relative(normalizedRoot, current);
    if (
      relative === '..' ||
      relative.startsWith(`..${pathModule.sep}`) ||
      pathModule.isAbsolute(relative)
    ) {
      break;
    }
    try {
      if ((await fileOperations.readdir(current)).length > 0) break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') break;
      throw error;
    }

    await fileOperations.rmdir(current);
    current = pathModule.dirname(current);
  }
}
