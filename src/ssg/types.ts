/**
 * Type definitions for Static Site Generation.
 */

import type {
  DocumentRenderer,
  SSRStyleRegistrationValidation,
} from '../common/ssr';
import type {
  RouteHandler,
  RouteOptions,
  RoutePathParams,
  RoutePolicy,
  RouteRegistry,
} from '../common/router';
import type { AuthRequirement } from '@askrjs/auth';

export type SSGMode = 'full' | 'incremental';

export type RouteRenderStatus = 'success' | 'error' | 'skipped' | 'removed';

export type RouteRenderReason =
  | 'full'
  | 'changed-key'
  | 'changed-route'
  | 'new-route'
  | 'no-keys'
  | 'unchanged'
  | 'deleted'
  | 'runtime-only';

type RouteConfigParams<Path extends string> = string extends Path
  ? Record<string, string>
  : RoutePathParams<Path>;

/**
 * Route config accepted by SSG.
 *
 * The handler is defined by the route registry and matches router/SSR naming.
 */
export interface RouteConfig<Path extends string = string> {
  /** URL path to generate (e.g., "/blog/post-1", "/") */
  path: Path;
  /** Route handler compatible with router/SSR */
  handler: RouteHandler;
  /** Optional base props merged with route params during render */
  props?: Record<string, unknown>;
  /** Optional namespace for router compatibility */
  namespace?: string;
  /** Routes with request-auth requirements are runtime-only by default. */
  auth?: AuthRequirement;
  /** Advanced runtime access checks disable prerendering by default */
  policies?: readonly RoutePolicy[];
  /** Optional path parameter map for template paths like "/blog/{slug}" */
  params?: RouteConfigParams<Path>;
  /** Optional explicit invalidation keys for incremental generation */
  invalidationKeys?: string[];
  /** Route loader resolved completely before static HTML is rendered. */
  loader?: RouteOptions['loader'];
  /** Select the loader data transported for initial hydration. */
  dehydrate?: RouteOptions['dehydrate'];
  /** @internal Public mount point inherited from the owning registry. */
  basePath?: string;
  /**
   * SSG entry generator for parameterized routes.
   *
   * Return one param map per page to be generated.  The path template is
   * expanded with each map to produce a concrete URL, e.g.:
   *
   * ```ts
   * route('/posts/{slug}', PostPage, {
   *   entries: async () => getPosts().map(p => ({ slug: p.slug })),
   * });
   * ```
   */
  entries?: () =>
    | Array<RouteConfigParams<Path>>
    | Promise<Array<RouteConfigParams<Path>>>;
}

interface SSGBaseOptions {
  /** Output directory for generated HTML files */
  outputDir: string;
  /** Optional seed for deterministic rendering */
  seed?: number;
  /** Optional override data for resources (route-keyed) */
  dataOverrides?: Record<string, unknown>;
  /** Optional document wrapper for full HTML output */
  document?: DocumentRenderer;
  /** Diagnose document renderers that omit request-local SSR style registrations. */
  styleRegistrationValidation?: SSRStyleRegistrationValidation;
  /** Static files or directories published with the generated routes. */
  assets?: readonly SSGAssetSource[];
  /** Optional concurrency limit for rendering (default: 1) */
  concurrency?: number;
  /** Preferred render parallelism. `'auto'` resolves from the host machine. */
  parallelism?: number | 'auto';
}

export interface SSGAssetSource {
  /** Source file or directory. Relative paths resolve from the current working directory. */
  from: string;
  /** Destination relative to outputDir. Defaults to the source basename. */
  to?: string;
}

/** Options for createStaticGen */
export type SSGOptions<
  _TRoutes extends readonly RouteConfig[] = RouteConfig[],
> = SSGBaseOptions & {
  /** Explicit route registry captured with `createRouteRegistry()`. */
  registry: RouteRegistry;
};

/** Options for a single generation run */
export interface SSGGenerateOptions {
  /** Generation mode */
  mode?: SSGMode;
  /** Changed invalidation keys for incremental runs */
  changedKeys?: string[];
  /** Changed concrete route paths for incremental runs */
  changedRoutes?: string[];
  /** Force a full rebuild even when incremental mode was requested */
  forceFull?: boolean;
}

/** Result of rendering a single route */
export interface RouteRenderResult {
  /** URL path */
  path: string;
  /** Output file path relative to outputDir */
  filePath: string;
  /** Generated HTML content */
  html: string;
  /** File size in bytes */
  fileSize: number;
  /** Render duration in milliseconds */
  renderDuration: number;
  /** Number of resources discovered and rendered */
  resourceCount: number;
  /** Render or generation status */
  status: RouteRenderStatus;
  /** Why this route was rendered, skipped, or removed */
  reason: RouteRenderReason;
  /** Whether the output file was written during this run */
  written: boolean;
  /** Error message if rendering failed */
  error?: string;
  /** Original exception preserved for programmatic diagnostics. */
  errorCause?: unknown;
  /** Route and phase context for the original exception. */
  errorContext?: { route: string; phase: 'load' | 'render' | 'write' };
}

/** Overall result from SSG generation */
export interface SSGResult {
  /** ISO timestamp of generation */
  generatedAt: string;
  /** Total number of routes processed */
  totalRoutes: number;
  /** Number of successfully generated routes */
  successful: number;
  /** Number of failed routes */
  failed: number;
  /** Total generation duration in milliseconds */
  totalDuration: number;
  /** Effective generation mode */
  mode: SSGMode;
  /** Number of routes rendered during this run */
  rebuilt: number;
  /** Number of current routes skipped as unchanged */
  skipped: number;
  /** Number of stale routes removed from output */
  removed: number;
  /** Number of rendered routes whose HTML bytes were unchanged */
  cacheHits: number;
  /** Invalidation keys applied to this run */
  invalidatedKeys: string[];
  /** Concrete route paths applied to this run */
  invalidatedRoutes: string[];
  /** Per-route results */
  routes: RouteRenderResult[];
}

/** Metadata to write to metadata.json */
export interface SSGMetadata extends Record<string, unknown> {
  /** ISO timestamp of generation */
  generatedAt: string;
  /** Total number of routes processed */
  totalRoutes: number;
  /** Number of successfully generated routes */
  successful: number;
  /** Number of failed routes */
  failed: number;
  /** Total generation duration in milliseconds */
  totalDuration: number;
  /** Effective generation mode */
  mode: SSGMode;
  /** Number of routes rendered during this run */
  rebuilt: number;
  /** Number of current routes skipped as unchanged */
  skipped: number;
  /** Number of stale routes removed from output */
  removed: number;
  /** Number of rendered routes whose HTML bytes were unchanged */
  cacheHits: number;
  /** Invalidation keys applied to this run */
  invalidatedKeys: string[];
  /** Concrete route paths applied to this run */
  invalidatedRoutes: string[];
  /** Per-route details */
  routes: Array<{
    /** URL path */
    path: string;
    /** Output file path relative to outputDir */
    filePath: string;
    /** File size in bytes */
    fileSize: number;
    /** Render duration in milliseconds */
    renderDuration: number;
    /** Number of resources discovered and rendered */
    resourceCount: number;
    /** Render or generation status */
    status: RouteRenderStatus;
    /** Why this route was rendered, skipped, or removed */
    reason: RouteRenderReason;
    /** Whether the output file was written during this run */
    written: boolean;
    /** Error message if rendering failed */
    error?: string;
  }>;
}

/** Resource discovery result for a single route */
export interface DiscoveredResources {
  [key: string]: {
    count: number;
    dependencies: string[];
  };
}
