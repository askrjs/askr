/**
 * Metadata generation for SSG
 *
 * Generates and serializes metadata about generated static files.
 * This module is Node-only and not intended for browser builds.
 */

import * as fs from 'node:fs/promises';
import * as pathModule from 'node:path';
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
  let successful = 0;
  let failed = 0;
  let totalDuration = 0;
  let rebuilt = 0;
  let skipped = 0;
  let removed = 0;

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    totalDuration += result.renderDuration;

    if (result.status === 'success') {
      successful += 1;
      rebuilt += 1;
    } else if (result.status === 'error') {
      failed += 1;
      rebuilt += 1;
    } else if (result.status === 'skipped') {
      skipped += 1;
    } else if (result.status === 'removed') {
      removed += 1;
    }
  }

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
  const routes: SSGMetadata['routes'] = [];

  for (let index = 0; index < result.routes.length; index += 1) {
    const route = result.routes[index];
    routes.push({
      path: route.path,
      filePath: route.filePath,
      fileSize: route.fileSize,
      renderDuration: route.renderDuration,
      resourceCount: route.resourceCount,
      status: route.status,
      reason: route.reason,
      written: route.written,
      error: route.error,
    });
  }

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
    routes,
  };
}

/**
 * Write metadata.json to output directory
 */
export async function writeMetadata(
  metadata: Record<string, unknown>,
  outputDir: string
): Promise<void> {
  const filePath = pathModule.join(outputDir, 'metadata.json');

  // Ensure directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Write metadata file with formatting
  await fs.writeFile(filePath, JSON.stringify(metadata, null, 2), 'utf8');
}
