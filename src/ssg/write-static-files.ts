/**
 * File I/O for Static Site Generation
 *
 * Uses Node.js fs/path modules to write rendered HTML files to disk.
 * This module is Node-only and not intended for browser builds.
 */

import * as fs from 'fs';
import * as pathModule from 'path';
import type { RouteRenderResult } from './types';

/**
 * Write rendered routes to disk
 * Creates outputDir/{route-path}/index.html structure
 */
export function writeStaticFiles(
  results: RouteRenderResult[],
  outputDir: string
): void {
  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  for (const result of results) {
    if (result.status === 'error') {
      console.warn(`Skipping failed route: ${result.path} - ${result.error}`);
      continue;
    }

    const fullPath = pathModule.join(outputDir, result.filePath);
    const dir = pathModule.dirname(fullPath);

    // Create parent directories
    fs.mkdirSync(dir, { recursive: true });

    // Write HTML file
    fs.writeFileSync(fullPath, result.html, 'utf8');
  }
}

/**
 * Get the output file path for a route
 * E.g., "/blog/post" -> "blog/post" or "/" -> ""
 */
export function getOutputFilePath(pathStr: string): string {
  if (pathStr === '/') {
    return 'index.html';
  }
  const normalized = pathStr.replace(/^\/|\/$/g, '');
  return `${normalized}/index.html`;
}
