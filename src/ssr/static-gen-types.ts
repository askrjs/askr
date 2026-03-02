/**
 * Static Site Generation (SSG) Type Definitions
 *
 * Defines types and interfaces for pre-rendering routes to static HTML files.
 */

import type { RouteHandler } from '../common/router';
import type { SSRData } from '../common/ssr';

/**
 * Route configuration for SSG.
 * Describes a single route to be pre-rendered.
 */
export interface SSGRouteConfig {
  /**
   * Route path pattern (e.g., "/", "/blog/{slug}", "/about")
   */
  path: string;

  /**
   * Route handler function that renders the page
   */
  handler: RouteHandler;

  /**
   * Optional route namespace (corresponds to route() namespace parameter)
   */
  namespace?: string;

  /**
   * Optional pre-computed route parameters (e.g., for /blog/{slug}, provide { slug: "post-1" })
   * If not provided, route path must be literal (no {param} placeholders required)
   */
  params?: Record<string, string>;
}

/**
 * Options for SSG generation
 */
export interface SSGOptions {
  /**
   * Array of routes to pre-render
   */
  routes: SSGRouteConfig[];

  /**
   * Output directory for generated HTML files
   * Files will be written as: {outputDir}/{routePath}/index.html
   */
  outputDir: string;

  /**
   * Optional seed for deterministic rendering
   * @default 12345
   */
  seed?: number;

  /**
   * Optional pre-supplied data for resources
   * Map of resourceKey -> data value
   * Merged with auto-discovered resources
   */
  dataOverrides?: Record<string, unknown>;

  /**
   * Whether to auto-discover resources from components
   * @default true
   */
  includeResources?: boolean;
}

/**
 * Result of rendering a single route
 */
export interface SSGRouteResult {
  /**
   * The route path that was rendered (e.g., "/blog/post-1")
   */
  route: string;

  /**
   * Generated HTML content
   */
  html: string;

  /**
   * Output file path relative to outputDir (e.g., "blog/post-1/index.html")
   */
  filePath: string;

  /**
   * Size of the generated HTML file in bytes
   */
  fileSize: number;

  /**
   * Time taken to render this route in milliseconds
   */
  renderDuration: number;

  /**
   * Number of resources rendered for this route
   */
  resourceCount: number;

  /**
   * Render status
   */
  status: 'success' | 'error';

  /**
   * Error message if rendering failed
   */
  error?: Error;
}

/**
 * Complete metadata for an SSG run
 */
export interface SSGMetadata {
  /**
   * ISO timestamp of when generation started
   */
  generatedAt: string;

  /**
   * Total number of routes that were attempted
   */
  totalRoutes: number;

  /**
   * Number of routes rendered successfully
   */
  successful: number;

  /**
   * Number of routes that failed
   */
  failed: number;

  /**
   * Total time to generate all routes in milliseconds
   */
  totalDuration: number;

  /**
   * Per-route results
   */
  routes: Array<{
    /**
     * The route path (e.g., "/blog/post-1")
     */
    path: string;

    /**
     * Output file path relative to outputDir
     */
    filePath: string;

    /**
     * File size in bytes
     */
    fileSize: number;

    /**
     * Render duration in milliseconds
     */
    renderDuration: number;

    /**
     * Number of resources rendered
     */
    resourceCount: number;

    /**
     * Status: "success" or "error"
     */
    status: 'success' | 'error';

    /**
     * Error message if status is "error"
     */
    error?: string;
  }>;
}

/**
 * Result of SSG generation
 */
export interface SSGResult {
  /**
   * Metadata about the generation run
   */
  metadata: SSGMetadata;

  /**
   * Per-route results
   */
  routes: SSGRouteResult[];

  /**
   * True if all routes were rendered successfully
   */
  success: boolean;
}
