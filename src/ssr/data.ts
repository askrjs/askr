import type { SSRRoute } from './index';
import type { SSRContext } from './context';
import type { JSXElement } from '../jsx/types';

export type ResourceDescriptor = {
  key: string;
  fn: (opts: { signal?: AbortSignal }) => Promise<unknown> | unknown;
  deps: unknown[];
  index: number;
};

export type ResourcePlan = {
  resources: ResourceDescriptor[]; // declarative manifest in stable order
};

// Internal collection state
let currentCollection: { resources: ResourceDescriptor[] } | null = null;
let keyCounter = 0;
let currentRenderData: Record<string, unknown> | null = null;

export function isCollecting(): boolean {
  return currentCollection !== null;
}

export function getCurrentRenderData(): Record<string, unknown> | null {
  return currentRenderData;
}

export function resetKeyCounter() {
  keyCounter = 0;
}

export function getNextKey(): string {
  return `r:${keyCounter++}`;
}

export function startCollection() {
  currentCollection = { resources: [] };
  resetKeyCounter();
}

export function stopCollection(): ResourcePlan {
  const plan: ResourcePlan = {
    resources: currentCollection!.resources.slice(),
  };
  currentCollection = null;
  resetKeyCounter();
  return plan;
}

export function registerResourceIntent(
  fn: ResourceDescriptor['fn'],
  deps: unknown[]
): string {
  if (!currentCollection)
    throw new Error('registerResourceIntent called outside collection');
  const key = getNextKey();
  const descriptor: ResourceDescriptor = {
    key,
    fn,
    deps: deps.slice(),
    index: currentCollection.resources.length,
  };
  currentCollection.resources.push(descriptor);
  return key;
}

export function startRenderPhase(data: Record<string, unknown> | null) {
  currentRenderData = data ?? null;
  resetKeyCounter();
}

export function stopRenderPhase() {
  currentRenderData = null;
  resetKeyCounter();
}

// Resolve a plan (execute resource functions in declared order)
export async function resolvePlan(
  plan: ResourcePlan
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const r of plan.resources) {
    const result = r.fn({});
    const val = result instanceof Promise ? await result : result;
    out[r.key] = val;
  }
  return out;
}

// Helper: produce a plan by running a user render pass in collection mode
import * as RouteModule from '../router/route';
import { renderNodeToSink } from './render';
import { StringSink } from './sink';

export function collectResources(opts: {
  url: string;
  routes: SSRRoute[];
}): ResourcePlan {
  const { url, routes } = opts;

  // Register routes (same as runtime renderer)
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
  if (!resolved)
    throw new Error(`collectResources: no route found for url: ${url}`);

  // Start collection
  startCollection();

  try {
    // Render the handler into a no-op sink to traverse components which will call
    // resource() and register intents via registerResourceIntent.
    const ctx: SSRContext = {
      url,
      seed: 1,
      data: undefined,
      params: resolved.params,
      signal: undefined as AbortSignal | undefined,
    };
    const props = { ...(resolved.params || {}) };
    const node = resolved.handler(props) as unknown as
      | JSXElement
      | string
      | number
      | null;
    // Use the existing sink renderer to walk the tree
    renderNodeToSink(node, new StringSink(), ctx);

    // Stop collection and return plan
    const plan = stopCollection();
    return plan;
  } finally {
    // Ensure no leaked collection state
    if (isCollecting()) stopCollection();
  }
}

// Backwards-compatible alias: new public API prefers the name `resolveResources`
export const resolveResources = resolvePlan;
