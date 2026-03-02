/**
 * Metadata Generation for SSG
 *
 * Constructs metadata.json from render results.
 */

import type { SSGRouteResult, SSGMetadata } from './static-gen-types';

/**
 * Generate metadata from render results.
 *
 * @param results Per-route render results
 * @returns Metadata object suitable for JSON serialization
 */
export function generateMetadata(results: SSGRouteResult[]): SSGMetadata {
  const successful = results.filter((r) => r.status === 'success').length;
  const failed = results.length - successful;
  const totalDuration = results.reduce((sum, r) => sum + r.renderDuration, 0);

  return {
    generatedAt: new Date().toISOString(),
    totalRoutes: results.length,
    successful,
    failed,
    totalDuration,
    routes: results.map((r) => ({
      path: r.route,
      filePath: r.filePath,
      fileSize: r.fileSize,
      renderDuration: r.renderDuration,
      resourceCount: r.resourceCount,
      status: r.status,
      error: r.error ? r.error.message : undefined,
    })),
  };
}

/**
 * Format metadata for console output.
 *
 * @param metadata Metadata object
 * @returns Formatted string
 */
export function formatMetadata(metadata: SSGMetadata): string {
  const lines = [
    `Generated: ${metadata.generatedAt}`,
    `Total routes: ${metadata.totalRoutes}`,
    `Successful: ${metadata.successful}`,
    `Failed: ${metadata.failed}`,
    `Total time: ${metadata.totalDuration}ms`,
  ];

  if (metadata.failed > 0) {
    lines.push('\nFailed routes:');
    for (const route of metadata.routes) {
      if (route.status === 'error') {
        lines.push(`  - ${route.path}: ${route.error || 'Unknown error'}`);
      }
    }
  }

  return lines.join('\n');
}
