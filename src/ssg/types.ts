/**
 * Type definitions for Static Site Generation
 */

import type { ComponentFunction } from '../common/component';

/** Configuration for a single route to generate */
export interface RouteConfig {
  /** URL path to generate (e.g., "/blog/post-1", "/") */
  path: string;
  /** Component function to render for this route */
  component: ComponentFunction;
  /** Optional props to pass to component */
  props?: Record<string, unknown>;
}

/** Options for createStaticGen */
export interface SSGOptions {
  /** Routes to generate */
  routes: RouteConfig[];
  /** Output directory for generated HTML files */
  outputDir: string;
  /** Optional seed for deterministic rendering */
  seed?: number;
  /** Optional override data for resources (route-keyed) */
  dataOverrides?: Record<string, unknown>;
  /** Optional concurrency limit for rendering (default: 10) */
  concurrency?: number;
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
  /** Status: success or error */
  status: 'success' | 'error';
  /** Error message if rendering failed */
  error?: string;
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
  /** Per-route results */
  routes: RouteRenderResult[];
}

/** Metadata to write to metadata.json */
export interface SSGMetadata {
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
    /** Status: success or error */
    status: 'success' | 'error';
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
