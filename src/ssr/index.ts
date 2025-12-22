/**
 * SSR - Server-Side Rendering
 *
 * Renders Askr components to static HTML strings for server-side rendering.
 * SSR is synchronous: async components are not supported; async work should use
 * `resource()` which is rejected during synchronous SSR. This module throws
 * when an async component or async resource is encountered during sync SSR.
 */

import type { JSXElement } from '../jsx/types';
import type { RouteHandler } from '../router/route';
import * as RouteModule from '../router/route';
import type { Props } from '../shared/types';
import {
  createRenderContext,
  runWithSSRContext,
  throwSSRDataMissing,
  type RenderContext,
  type SSRData,
} from './context';
import {
  createComponentInstance,
  setCurrentComponentInstance,
  getCurrentComponentInstance,
} from '../runtime/component';
import type { ComponentFunction } from '../runtime/component';

export { SSRDataMissingError } from './context';

type VNode = {
  type: string;
  props?: Props;
  children?: (string | VNode | null | undefined | false)[];
};

export type Component = (
  props: Props,
  context?: { signal?: AbortSignal; ssr?: RenderContext }
) => VNode | JSXElement;

// HTML5 void elements that don't have closing tags
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

// Escape cache for common values
const escapeCache = new Map<string, string>();

// Dev-only SSR strictness guard helpers. We mutate globals in dev to make
// accidental usage of Math.random/Date.now during sync SSR fail fast.
// We implement a re-entrant stack so nested or concurrent calls don't clobber
// global values unexpectedly.
const __ssrGuardStack: Array<{ random: () => number; now: () => number }> = [];

export function pushSSRStrictPurityGuard() {
  /* istanbul ignore if - dev-only guard */
  if (process.env.NODE_ENV === 'production') return;
  __ssrGuardStack.push({
    random: Reflect.get(Math, 'random') as () => number,
    now: Reflect.get(Date, 'now') as () => number,
  });
  Reflect.set(Math, 'random', () => {
    throw new Error(
      'SSR Strict Purity: Math.random is not allowed during synchronous SSR. Use the provided `ssr` context RNG instead.'
    );
  });
  Reflect.set(Date, 'now', () => {
    throw new Error(
      'SSR Strict Purity: Date.now is not allowed during synchronous SSR. Pass timestamps explicitly or use deterministic helpers.'
    );
  });
}

export function popSSRStrictPurityGuard() {
  /* istanbul ignore if - dev-only guard */
  if (process.env.NODE_ENV === 'production') return;
  const prev = __ssrGuardStack.pop();
  if (prev) {
    Reflect.set(Math, 'random', prev.random);
    Reflect.set(Date, 'now', prev.now);
  }
}

/**
 * Escape HTML special characters in text content (optimized with cache)
 */
function escapeText(text: string): string {
  const cached = escapeCache.get(text);
  if (cached) return cached;

  const str = String(text);
  // Fast path: check if escaping needed
  if (!str.includes('&') && !str.includes('<') && !str.includes('>')) {
    escapeCache.set(text, str);
    return str;
  }

  const result = str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  if (escapeCache.size < 256) {
    escapeCache.set(text, result);
  }
  return result;
}

/**
 * Escape HTML special characters in attribute values
 */
function escapeAttr(value: string): string {
  const str = String(value);
  // Fast path: check if escaping needed
  if (
    !str.includes('&') &&
    !str.includes('"') &&
    !str.includes("'") &&
    !str.includes('<') &&
    !str.includes('>')
  ) {
    return str;
  }

  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Render attributes to HTML string, excluding event handlers
 * Optimized for minimal allocations
 */
function renderAttrs(props?: Props): string {
  if (!props || typeof props !== 'object') return '';

  let result = '';
  for (const [key, value] of Object.entries(props)) {
    // Skip event handlers (onClick, onChange, etc.)
    if (key.startsWith('on') && key[2] === key[2].toUpperCase()) {
      continue;
    }
    // Skip internal props
    if (key.startsWith('_')) {
      continue;
    }

    // Normalize class attribute (`class` preferred, accept `className` for compatibility)
    const attrName = key === 'class' || key === 'className' ? 'class' : key;

    // Boolean attributes
    if (value === true) {
      result += ` ${attrName}`;
    } else if (value === false || value === null || value === undefined) {
      // Skip falsy values
      continue;
    } else {
      // Regular attributes
      result += ` ${attrName}="${escapeAttr(String(value))}"`;
    }
  }
  return result;
}

/**
 * Synchronous rendering helpers (used for strictly synchronous SSR)
 */
function renderChildSync(child: unknown, ctx: RenderContext): string {
  if (typeof child === 'string') return escapeText(child);
  if (typeof child === 'number') return escapeText(String(child));
  if (child === null || child === undefined || child === false) return '';
  if (typeof child === 'object' && child !== null && 'type' in child) {
    // We already verified the shape above; assert as VNode for the sync renderer
    return renderNodeSync(child as VNode, ctx);
  }
  return '';
}

function renderChildrenSync(
  children: unknown[] | undefined,
  ctx: RenderContext
): string {
  if (!children || !Array.isArray(children) || children.length === 0) return '';
  let result = '';
  for (const child of children) result += renderChildSync(child, ctx);
  return result;
}

/**
 * Render a VNode synchronously. Throws if an async component is encountered.
 */
function renderNodeSync(node: VNode | JSXElement, ctx: RenderContext): string {
  const { type, props } = node;

  if (typeof type === 'function') {
    const result = executeComponentSync(type as Component, props, ctx);
    if (result instanceof Promise) {
      // Use centralized SSR error to maintain a single failure mode
      throwSSRDataMissing();
    }
    return renderNodeSync(result as VNode | JSXElement, ctx);
  }

  const typeStr = type as string;
  if (VOID_ELEMENTS.has(typeStr)) {
    const attrs = renderAttrs(props);
    return `<${typeStr}${attrs} />`;
  }

  const attrs = renderAttrs(props);
  const children = (node as VNode).children;
  const childrenHtml = renderChildrenSync(children, ctx);
  return `<${typeStr}${attrs}>${childrenHtml}</${typeStr}>`;
}

/**
 * Execute a component function (synchronously or async) and return VNode
 */
/**
 * Execute a component synchronously inside a render-only context.
 * This must not create or reuse runtime ComponentInstance objects. We pass
 * the render context explicitly as `context.ssr` in the second argument so
 * components can opt-in to deterministic randomness/time via the provided RNG.
 */
function executeComponentSync(
  component: Component,
  props: Record<string, unknown> | undefined,
  ctx: RenderContext
): VNode | JSXElement {
  // Dev-only: enforce SSR purity with clear messages. We temporarily override
  // `Math.random` and `Date.now` while rendering to produce a targeted error
  // if components call them directly. We restore them immediately afterwards.
  // Re-entrant guard for dev-only SSR strict purity checks.
  // We avoid clobbering globals permanently by pushing the original functions
  // onto a stack and restoring them on exit. This is safer for nested or
  // stacked SSR render invocations.

  try {
    if (process.env.NODE_ENV !== 'production') {
      pushSSRStrictPurityGuard();
    }
    // Create a temporary, lightweight component instance so runtime APIs like
    // `state()` and `route()` can be called during SSR render. We avoid mounting
    // or side-effects by not attaching the instance to any DOM target.
    const prev = getCurrentComponentInstance();
    const temp = createComponentInstance(
      'ssr-temp',
      component as ComponentFunction,
      (props || {}) as Props,
      null
    );
    temp.ssr = true;
    setCurrentComponentInstance(temp);
    try {
      return runWithSSRContext(ctx, () => {
        const result = component((props || {}) as Props, { ssr: ctx });
        if (result instanceof Promise) {
          // Use the centralized SSR error for async data/components during SSR
          throwSSRDataMissing();
        }
        return result as VNode | JSXElement;
      });
    } finally {
      // Restore the previous instance (if any)
      setCurrentComponentInstance(prev);
    }
  } finally {
    if (process.env.NODE_ENV !== 'production') popSSRStrictPurityGuard();
  }
}

/**
 * Single synchronous SSR entrypoint: render a component to an HTML string.
 * This is strictly synchronous and deterministic. Optionally provide a seed
 * for deterministic randomness via `options.seed`.
 */
export function renderToStringSync(
  component: (
    props?: Record<string, unknown>
  ) => VNode | JSXElement | string | number | null,
  props?: Record<string, unknown>,
  options?: { seed?: number; data?: SSRData }
): string {
  const seed = options?.seed ?? 12345;
  // Start render-phase keying (aligns with collectResources)
  const ctx = createRenderContext(seed);
  // Provide optional SSR data via options.data
  startRenderPhase(options?.data ?? null);
  try {
    const node = executeComponentSync(component as Component, props || {}, ctx);
    return renderNodeSync(node, ctx);
  } finally {
    stopRenderPhase();
  }
}

// Synchronous server render for strict checks. Routes must be resolved before
// the render pass so no route() calls happen during rendering.
export function renderToStringSyncForUrl(opts: {
  url: string;
  routes: Array<{ path: string; handler: RouteHandler; namespace?: string }>;
  options?: { seed?: number; data?: SSRData };
}): string {
  const { url, routes, options } = opts;
  // Register routes synchronously using route() (already available in module scope)
  const {
    clearRoutes,
    route,
    setServerLocation,
    lockRouteRegistration,
    resolveRoute,
  } = RouteModule;

  clearRoutes();
  for (const r of routes) {
    route(r.path, r.handler, r.namespace);
  }

  setServerLocation(url);
  if (process.env.NODE_ENV === 'production') lockRouteRegistration();

  const resolved = resolveRoute(url);
  if (!resolved)
    throw new Error(`renderToStringSync: no route found for url: ${url}`);

  const seed = options?.seed ?? 12345;
  const ctx = createRenderContext(seed);
  // Start render-phase keying (aligns with collectResources)
  startRenderPhase(options?.data ?? null);
  try {
    const node = executeComponentSync(
      resolved.handler as Component,
      resolved.params || {},
      ctx
    );
    return renderNodeSync(node, ctx);
  } finally {
    stopRenderPhase();
  }
}

// --- Streaming sink-based renderer (v2) --------------------------------------------------
import { StringSink, StreamSink } from './sink';
import { renderNodeToSink } from './render';
import {
  startRenderPhase,
  stopRenderPhase,
  collectResources,
  resolvePlan,
  resolveResources,
  ResourcePlan,
} from './data';

export type SSRRoute = {
  path: string;
  handler: RouteHandler;
  namespace?: string;
};

export function renderToString(
  component: (
    props?: Record<string, unknown>
  ) => VNode | JSXElement | string | number | null
): string;
export function renderToString(opts: {
  url: string;
  routes: SSRRoute[];
  seed?: number;
  data?: SSRData;
}): string;
export function renderToString(arg: unknown): string {
  // Convenience: if a component function is passed, delegate to sync render
  if (typeof arg === 'function') {
    return renderToStringSync(
      arg as (
        props?: Record<string, unknown>
      ) => VNode | JSXElement | string | number | null
    );
  }
  const opts = arg as {
    url: string;
    routes: SSRRoute[];
    seed?: number;
    data?: SSRData;
  };
  const sink = new StringSink();
  renderToSinkInternal({ ...opts, sink });
  sink.end();
  return sink.toString();
}

export function renderToStream(opts: {
  url: string;
  routes: SSRRoute[];
  seed?: number;
  data?: SSRData;
  onChunk(html: string): void;
  onComplete(): void;
}): void {
  const sink = new StreamSink(opts.onChunk, opts.onComplete);
  renderToSinkInternal({ ...opts, sink });
  sink.end();
}

function renderToSinkInternal(opts: {
  url: string;
  routes: SSRRoute[];
  seed?: number;
  data?: SSRData;
  sink: { write(html: string): void; end(): void };
}) {
  const { url, routes, seed = 1, data, sink } = opts;

  // Route resolution happens BEFORE render pass
  const {
    clearRoutes,
    route,
    setServerLocation,
    lockRouteRegistration,
    resolveRoute,
  } = RouteModule;

  clearRoutes();
  for (const r of routes) route(r.path, r.handler, r.namespace);

  setServerLocation(url);
  if (process.env.NODE_ENV === 'production') lockRouteRegistration();

  const resolved = resolveRoute(url);
  if (!resolved) throw new Error(`SSR: no route found for url: ${url}`);

  const ctx = {
    url,
    seed,
    data,
    params: resolved.params,
    signal: undefined as AbortSignal | undefined,
  };

  // Render the resolved handler with params
  const node = resolved.handler(resolved.params) as
    | VNode
    | JSXElement
    | string
    | number
    | null;

  // Start render-phase keying so resource() can lookup resolved `data` by key
  startRenderPhase(data || null);
  try {
    renderNodeToSink(node, sink, ctx);
  } finally {
    stopRenderPhase();
  }
}

export { collectResources, resolvePlan, resolveResources, ResourcePlan };
