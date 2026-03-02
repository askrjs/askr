/**
 * File I/O for Static Site Generation
 */

import { mkdir, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import type { RouteRenderResult } from './types';

/**
 * Write rendered routes to disk
 * Creates outputDir/{route-path}/index.html structure
 */
export async function writeStaticFiles(
  results: RouteRenderResult[],
  outputDir: string
): Promise<void> {
  // Ensure output directory exists
  await mkdir(outputDir, { recursive: true });

  for (const result of results) {
    if (result.status === 'error') {
      console.warn(`Skipping failed route: ${result.path} - ${result.error}`);
      continue;
    }

    // Determine output file path
    const filePath = getOutputFilePath(outputDir, result.path);

    // Create parent directories
    const dir = dirname(filePath);
    await mkdir(dir, { recursive: true });

    // Write HTML file
    await writeFile(filePath, result.html, 'utf8');

    // Update result with actual file path for metadata
    result.fileSize = Buffer.byteLength(result.html, 'utf8');
  }
}

/**
 * Get the full file path for a route
 * E.g., "/blog/post" -> "outputDir/blog/post/index.html"
 * E.g., "/" -> "outputDir/index.html"
 */
export function getOutputFilePath(outputDir: string, path: string): string {
  if (path === '/') {
    return join(outputDir, 'index.html');
  }

  // Remove leading/trailing slashes and append index.html
  const normalized = path.replace(/^\/|\/$/g, '');
  return join(outputDir, normalized, 'index.html');
}
