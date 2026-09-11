import {
  SSRStyleRegistrationValidation,
  RoutePathParams,
  DocumentRenderer,
  DocumentRenderContext,
  RouteRegistry,
  RouteHandler,
  RouteOptions,
  DocumentRenderArgs,
  RoutePolicy,
} from '../core.js';
import { AuthRequirement } from '@askrjs/auth';
import 'node:fs/promises';
/** Whether an SSG run rebuilds every route (`full`) or only changed ones (`incremental`). */
type SSGMode = 'full' | 'incremental';
/** Outcome of generating a single route's static HTML. */
type RouteRenderStatus = 'success' | 'error' | 'skipped' | 'removed';
/** Why a route was rendered, skipped, or removed during generation. */
type RouteRenderReason =
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
interface RouteConfig<Path extends string = string> {
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
/** A static file or directory to copy alongside generated routes. */
interface SSGAssetSource {
  /** Source file or directory. Relative paths resolve from the current working directory. */
  from: string;
  /** Destination relative to outputDir. Defaults to the source basename. */
  to?: string;
}
/** Options for createStaticGen */
type SSGOptions<_TRoutes extends readonly RouteConfig[] = RouteConfig[]> =
  SSGBaseOptions & {
    /** Explicit route registry captured with `createRouteRegistry()`. */
    registry: RouteRegistry;
  };
/** Options for a single generation run */
interface SSGGenerateOptions {
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
interface RouteRenderResult {
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
  errorContext?: {
    route: string;
    phase: 'load' | 'render' | 'write';
  };
}
/** Overall result from SSG generation */
interface SSGResult {
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
interface SSGMetadata extends Record<string, unknown> {
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
interface DiscoveredResources {
  [key: string]: {
    count: number;
    dependencies: string[];
  };
}
/**
 * Create a Static Site Generator
 *
 * Usage:
 * ```ts
 * const ssg = createStaticGen({
 *   registry,
 *   outputDir: './dist',
 *   dataOverrides: {
 *     '/api/posts': { posts: [...] }
 *   }
 * });
 *
 * const result = await ssg.generate();
 * console.log(`Generated ${result.successful}/${result.totalRoutes} routes`);
 * ```
 */
declare function createStaticGen(options: SSGOptions): {
  /**
   * Generate static HTML for all routes
   * Writes to outputDir with metadata.json
   * Returns detailed results
   */
  generate(generateOptions?: SSGGenerateOptions): Promise<SSGResult>;
  /**
   * Get effective config in a serializable form for diagnostics.
   */
  getConfig(): {
    routeCount: number;
    outputDir: string;
    seed: number;
    concurrency: number;
    parallelism: number;
    hasDataOverrides: boolean;
    assetCount: number;
  };
  /**
   * Get the last generation result
   * Returns null if generate() hasn't been called
   */
  getResult(): SSGResult | null;
};
export {
  type DiscoveredResources,
  type DocumentRenderArgs,
  type DocumentRenderContext,
  type DocumentRenderer,
  type RouteConfig,
  type RouteRenderReason,
  type RouteRenderResult,
  type RouteRenderStatus,
  type SSGAssetSource,
  type SSGGenerateOptions,
  type SSGMetadata,
  type SSGMode,
  type SSGOptions,
  type SSGResult,
  type SSRStyleRegistrationValidation,
  createStaticGen,
};
