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

/**
 * Write rendered routes to disk
 * Creates outputDir/{route-path}/index.html structure
 */
export async function writeStaticFiles(
  results: RouteRenderResult[],
  outputDir: string,
  options: WriteStaticFilesOptions = {}
): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });

  for (const result of results) {
    if (result.status !== 'removed') {
      continue;
    }

    const fullPath = pathModule.join(outputDir, result.filePath);
    if (fsSync.existsSync(fullPath)) {
      await fs.rm(fullPath, { force: true });
      await pruneEmptyDirs(pathModule.dirname(fullPath), outputDir);
    }
  }

  const pendingWrites = results.filter((result) => {
    if (result.status === 'error') {
      console.warn(`Skipping failed route: ${result.path} - ${result.error}`);
      return false;
    }
    return result.status === 'success' && result.written;
  });

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
    await fs.mkdir(dir, { recursive: true });
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
      await fs.writeFile(fullPath, result.html, 'utf8');
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

/**
 * Get the output file path for a route
 * E.g., "/blog/post" -> "blog/post" or "/" -> ""
 */
export { getOutputFilePath } from './route-utils';

async function pruneEmptyDirs(startDir: string, rootDir: string): Promise<void> {
  let current = startDir;
  const normalizedRoot = pathModule.resolve(rootDir);

  while (current.startsWith(normalizedRoot)) {
    if (!fsSync.existsSync(current)) {
      break;
    }

    if ((await fs.readdir(current)).length > 0) {
      break;
    }

    await fs.rmdir(current);
    if (pathModule.resolve(current) === normalizedRoot) {
      break;
    }
    current = pathModule.dirname(current);
  }
}
