import type { SSRRoute } from './index';

export type ResourceDescriptor = {
  key: string;
  fn: (opts: { signal?: AbortSignal }) => Promise<unknown> | unknown;
  deps: unknown[];
  index: number;
};

export type ResourcePlan = {
  resources: ResourceDescriptor[]; // declarative manifest in stable order
};

// Internal collection state (collection/prepass removed)
let keyCounter = 0;
let currentRenderData: Record<string, unknown> | null = null;

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
  throw new Error(
    'SSR collection/prepass is removed: SSR is strictly synchronous; do not call startCollection()'
  );
}

export function stopCollection(): ResourcePlan {
  throw new Error(
    'SSR collection/prepass is removed: SSR is strictly synchronous; do not call stopCollection()'
  );
}

export function registerResourceIntent(
  _fn: ResourceDescriptor['fn'],
  _deps: unknown[]
): string {
  throw new Error(
    'SSR resource intents collection is removed: resource() no longer registers intents for prepass'
  );
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
  _plan: ResourcePlan
): Promise<Record<string, unknown>> {
  throw new Error(
    'SSR resolution of prepass plans is removed: SSR is strictly synchronous and does not support resolving async resource plans'
  );
}

export function collectResources(_opts: {
  url: string;
  routes: SSRRoute[];
}): ResourcePlan {
  throw new Error(
    'SSR collection/prepass (collectResources) is removed: SSR is strictly synchronous and does not support prepass collection'
  );
}

// Backwards-compatible alias: new public API prefers the name `resolveResources`
export const resolveResources = resolvePlan;
