/**
 * Metadata generation for SSG
 *
 * Generates and serializes metadata about generated static files.
 * This module is Node-only and not intended for browser builds.
 */

import * as fs from 'fs';
import * as pathModule from 'path';
import type {
  RouteRenderResult,
  SSGMetadata,
  SSGMode,
  SSGResult,
} from './types';

interface GenerateResultOptions {
  mode?: SSGMode;
  cacheHits?: number;
  invalidatedKeys?: string[];
  invalidatedRoutes?: string[];
}

/**
 * Generate SSGResult from render results
 */
export function generateSSGResult(
  results: RouteRenderResult[],
  options: GenerateResultOptions = {}
): SSGResult {
  const successful = results.filter((r) => r.status === 'success').length;
  const failed = results.filter((r) => r.status === 'error').length;
  const totalDuration = results.reduce((sum, r) => sum + r.renderDuration, 0);
  const rebuilt = results.filter(
    (r) => r.status === 'success' || r.status === 'error'
  ).length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const removed = results.filter((r) => r.status === 'removed').length;

  return {
    generatedAt: new Date().toISOString(),
    totalRoutes: results.length,
    successful,
    failed,
    totalDuration: Math.round(totalDuration),
    mode: options.mode ?? 'full',
    rebuilt,
    skipped,
    removed,
    cacheHits: options.cacheHits ?? 0,
    invalidatedKeys: options.invalidatedKeys?.slice() ?? [],
    invalidatedRoutes: options.invalidatedRoutes?.slice() ?? [],
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
    mode: result.mode,
    rebuilt: result.rebuilt,
    skipped: result.skipped,
    removed: result.removed,
    cacheHits: result.cacheHits,
    invalidatedKeys: result.invalidatedKeys.slice(),
    invalidatedRoutes: result.invalidatedRoutes.slice(),
    routes: result.routes.map((r) => ({
      path: r.path,
      filePath: r.filePath,
      fileSize: r.fileSize,
      renderDuration: r.renderDuration,
      resourceCount: r.resourceCount,
      status: r.status,
      reason: r.reason,
      written: r.written,
      error: r.error,
    })),
  };
}

/**
 * Write metadata.json to output directory
 */
export function writeMetadata(
  metadata: Record<string, unknown>,
  outputDir: string
): void {
  const filePath = pathModule.join(outputDir, 'metadata.json');

  // Ensure directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // Write metadata file with formatting
  fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf8');
}
