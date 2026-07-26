import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as pathModule from 'node:path';
import type { RouteRenderStatus, SSGMode } from './types';
import { resolveSsgOutputPath } from './output-path';

export const SSG_MANIFEST_SCHEMA_VERSION = 1;
const MANIFEST_DIR = '.askr';
const MANIFEST_FILE = 'ssg-manifest.json';

export interface IncrementalManifestRouteEntry {
  routeId: string;
  path: string;
  filePath: string;
  invalidationKeys: string[];
  htmlHash: string | null;
  lastStatus: Extract<RouteRenderStatus, 'success' | 'error'>;
}

export interface IncrementalManifest {
  schemaVersion: number;
  seed: number;
  mode: SSGMode;
  routes: IncrementalManifestRouteEntry[];
}

export function hashHtml(html: string): string {
  // Deterministic 32-bit FNV-1a hash is sufficient for incremental change checks.
  let hash = 0x811c9dc5;
  for (let index = 0; index < html.length; index += 1) {
    hash ^= html.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function getIncrementalManifestPath(outputDir: string): string {
  return pathModule.join(outputDir, MANIFEST_DIR, MANIFEST_FILE);
}

export function readIncrementalManifest(
  outputDir: string,
  seed: number
): IncrementalManifest | null {
  const manifestPath = getIncrementalManifestPath(outputDir);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<IncrementalManifest>;

    if (
      parsed.schemaVersion !== SSG_MANIFEST_SCHEMA_VERSION ||
      parsed.seed !== seed ||
      !Array.isArray(parsed.routes)
    ) {
      return null;
    }

    const routes = parsed.routes.filter(
      (entry): entry is IncrementalManifestRouteEntry =>
        !!entry &&
        typeof entry.routeId === 'string' &&
        typeof entry.path === 'string' &&
        typeof entry.filePath === 'string' &&
        Array.isArray(entry.invalidationKeys) &&
        (entry.htmlHash === null || typeof entry.htmlHash === 'string') &&
        (entry.lastStatus === 'success' || entry.lastStatus === 'error')
    );

    if (routes.length !== parsed.routes.length) {
      return null;
    }

    return {
      schemaVersion: SSG_MANIFEST_SCHEMA_VERSION,
      seed,
      mode: parsed.mode === 'incremental' ? 'incremental' : 'full',
      routes,
    };
  } catch {
    return null;
  }
}

export async function writeIncrementalManifest(
  manifest: IncrementalManifest,
  outputDir: string
): Promise<void> {
  const manifestPath = getIncrementalManifestPath(outputDir);
  await fsPromises.mkdir(pathModule.dirname(manifestPath), { recursive: true });
  await fsPromises.writeFile(
    manifestPath,
    JSON.stringify(manifest, null, 2),
    'utf8'
  );
}

export function getExistingOutputFileSize(
  outputDir: string,
  filePath: string
): number {
  const fullPath = resolveSsgOutputPath(outputDir, filePath);
  if (!fs.existsSync(fullPath)) {
    return 0;
  }

  try {
    return fs.statSync(fullPath).size;
  } catch {
    return 0;
  }
}

export function outputFileExists(outputDir: string, filePath: string): boolean {
  return fs.existsSync(resolveSsgOutputPath(outputDir, filePath));
}
