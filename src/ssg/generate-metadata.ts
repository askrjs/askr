/**
 * Metadata generation for SSG
 */

import { writeFile } from 'fs/promises';
import { join } from 'path';
import type { RouteRenderResult, SSGMetadata, SSGResult } from './types';

/**
 * Generate SSGResult from render results
 */
export function generateSSGResult(
  results: RouteRenderResult[]
): SSGResult {
  const successful = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'error').length;
  const totalDuration = results.reduce((sum, r) => sum + r.renderDuration, 0);

  return {
    generatedAt: new Date().toISOString(),
    totalRoutes: results.length,
    successful,
    failed,
    totalDuration: Math.round(totalDuration),
    routes: results,
  };
}

/**
 * Convert SSGResult to metadata for JSON serialization
 */
export function resultToMetadata(result: SSGResult): SSGMetadata {
  return {
    generatedAt: result.generatedAt,
    totalRoutes: result.totalRoutes,
    successful: result.successful,
    failed: result.failed,
    totalDuration: result.totalDuration,
    routes: result.routes.map((r) => ({
      path: r.path,
      filePath: r.filePath,
      fileSize: r.fileSize,
      renderDuration: r.renderDuration,
      resourceCount: r.resourceCount,
      status: r.status,
      error: r.error,
    })),
  };
}

/**
 * Write metadata.json to output directory
 */
export async function writeMetadata(
  metadata: SSGMetadata,
  outputDir: string
): Promise<void> {
  const filePath = join(outputDir, 'metadata.json');
  const content = JSON.stringify(metadata, null, 2);
  await writeFile(filePath, content, 'utf8');
}
