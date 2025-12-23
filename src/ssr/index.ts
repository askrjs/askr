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
import { Fragment, ELEMENT_TYPE } from '../jsx';
import { DefaultPortal } from '../foundations/portal';
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
import { VOID_ELEMENTS, escapeText } from './escape';
import { renderAttrs } from './attrs';
import type { VNode, SSRComponent } from './types';

import { logger } from '../dev/logger';

export { SSRDataMissingError } from './context';
export type { VNode, SSRComponent } from './types';

// Re-export for backwards compatibility
export type Component = SSRComponent;

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

  /* istanbul ignore if - dev-only debug */
  if (process.env.NODE_ENV !== 'production') {
    try {
      logger.warn('[SSR] renderNodeSync type:', typeof type, type);
    } catch {
      // Ignore coercion errors for Symbols
    }
  }

  if (typeof type === 'function') {
    const result = executeComponentSync(type as Component, props, ctx);
    if (result instanceof Promise) {
      // Use centralized SSR error to maintain a single failure mode
      throwSSRDataMissing();
    }
    // executeComponentSync already normalizes primitives into VNode wrappers,
    // so result is always a VNode or JSXElement here. Safe to recurse directly.
    return renderNodeSync(result, ctx);
  }

  // Special-case fragments (symbols) - render children directly
  if (typeof type === 'symbol') {
    if (type === Fragment) {
      // Prefer explicit `children` array; fallback to `props.children` for
      // JSX runtimes that place children on props.
      const childrenArr = Array.isArray((node as VNode).children)
        ? (node as VNode).children
        : Array.isArray(props?.children)
          ? (props?.children as unknown[])
          : undefined;
      /* istanbul ignore if - dev-only debug */
      if (process.env.NODE_ENV !== 'production') {
        try {
          logger.warn('[SSR] fragment children length:', childrenArr?.length);
        } catch {
          // Ignore
        }
      }
      return renderChildrenSync(childrenArr, ctx);
    }
    // Unknown symbol type - throw a helpful error instead of letting
    // a built-in TypeError bubble up when attempting to coerce to string.
    throw new Error(
      `renderNodeSync: unsupported VNode symbol type: ${String(type)}`
    );
  }

  const typeStr = type as string;
  if (VOID_ELEMENTS.has(typeStr)) {
    const attrs = renderAttrs(props);
    return `<${typeStr}${attrs} />`;
  }

  const { attrs, dangerousHtml } = renderAttrs(props, {
    returnDangerousHtml: true,
  });
  // If dangerouslySetInnerHTML is set, use it instead of children
  if (dangerousHtml !== undefined) {
    return `<${typeStr}${attrs}>${dangerousHtml}</${typeStr}>`;
  }
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
        if (
          typeof result === 'string' ||
          typeof result === 'number' ||
          typeof result === 'boolean' ||
          result === null ||
          result === undefined
        ) {
          // Return a Fragment with the text content, not a div wrapper
          const inner =
            result === null || result === undefined || result === false
              ? ''
              : String(result);
          return {
            $$typeof: ELEMENT_TYPE,
            type: Fragment,
            props: { children: inner ? [inner] : [] },
          } as unknown as VNode | JSXElement;
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
    const wrapped: Component = (
      p?: Record<string, unknown>,
      c?: { signal?: AbortSignal; ssr?: RenderContext }
    ) => {
      const out = (component as unknown as Component)(p ?? {}, c);
      const portalVNode = {
        $$typeof: ELEMENT_TYPE,
        type: DefaultPortal,
        props: {},
        key: '__default_portal',
      } as unknown;
      if (out == null) {
        return {
          $$typeof: ELEMENT_TYPE,
          type: Fragment,
          props: { children: [portalVNode] },
        } as unknown as VNode | JSXElement;
      }
      return {
        $$typeof: ELEMENT_TYPE,
        type: Fragment,
        props: { children: [out as unknown, portalVNode] },
      } as unknown as VNode | JSXElement;
    };

    const node = executeComponentSync(wrapped, props || {}, ctx);
    if (!node) {
      throw new Error('renderToStringSync: wrapped component returned empty');
    }
    return renderNodeSync(node, ctx);
  } finally {
    stopRenderPhase();
  }
}

// Synchronous server render for strict checks. Routes must be resolved before
// the render pass so no route() calls happen during rendering.
//
// ⚠️ WARNING: This function mutates global route state. It is NOT safe to call
// concurrently from multiple async contexts. In long-running servers, ensure
// SSR requests are serialized or use isolated route contexts per request.
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
    const wrapped: Component = (
      p?: Record<string, unknown>,
      c?: { signal?: AbortSignal; ssr?: RenderContext }
    ) => {
      const out = (resolved.handler as unknown as Component)(p ?? {}, c);
      const portalVNode = {
        $$typeof: ELEMENT_TYPE,
        type: DefaultPortal,
        props: {},
        key: '__default_portal',
      } as unknown;
      if (out == null) {
        return {
          $$typeof: ELEMENT_TYPE,
          type: Fragment,
          props: { children: [portalVNode] },
        } as unknown as VNode | JSXElement;
      }
      return {
        $$typeof: ELEMENT_TYPE,
        type: Fragment,
        props: { children: [out as unknown, portalVNode] },
      } as unknown as VNode | JSXElement;
    };

    const node = executeComponentSync(wrapped, resolved.params || {}, ctx);
    return renderNodeSync(node, ctx);
  } finally {
    stopRenderPhase();
  }
}

// --- Streaming sink-based renderer (v2) --------------------------------------------------
import { StringSink, StreamSink } from './sink';
import { renderNodeToSink } from './stream-render';
import {
  startRenderPhase,
  stopRenderPhase,
  collectResources,
  resolvePlan,
  resolveResources,
  ResourcePlan,
} from './render-keys';

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
  const { url, routes, seed = 12345, data, sink } = opts;

  // ⚠️ WARNING: This function mutates global route state. It is NOT safe to call
  // concurrently from multiple async contexts. In long-running servers, ensure
  // SSR requests are serialized or use isolated route contexts per request.
  //
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
