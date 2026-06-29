/**
 * SSR Data Management
 *
 * Manages render-phase keying for deterministic SSR data lookup.
 * All state is stored in the per-render context for concurrency safety.
 */

import type { SSRRoute } from './index';
import {
  getCurrentRenderData as getCommonCurrentRenderData,
  getNextRenderKey,
  resetRenderKeyCounter,
  startHydrationRenderPhase as startCommonHydrationRenderPhase,
  startRenderPhase as startCommonRenderPhase,
  stopHydrationRenderPhase as stopCommonHydrationRenderPhase,
  stopRenderPhase as stopCommonRenderPhase,
} from '../common/render-context';

export type ResourceDescriptor = {
  key: string;
  fn: (opts: { signal?: AbortSignal }) => Promise<unknown> | unknown;
  deps: unknown[];
  index: number;
};

export type ResourcePlan = {
  resources: ResourceDescriptor[]; // declarative manifest in stable order
};

export function getCurrentRenderData(): Record<string, unknown> | null {
  return getCommonCurrentRenderData();
}

export function resetKeyCounter() {
  resetRenderKeyCounter();
}

export function getNextKey(): string {
  return getNextRenderKey();
}

export function startHydrationRenderPhase(data: Record<string, unknown>) {
  startCommonHydrationRenderPhase(data);
}

export function stopHydrationRenderPhase() {
  stopCommonHydrationRenderPhase();
}

export function startRenderPhase(data: Record<string, unknown> | null) {
  startCommonRenderPhase(data);
}

export function stopRenderPhase() {
  stopCommonRenderPhase();
}

// --- Deprecated APIs (throw descriptive errors) ---

const PREPASS_REMOVED_MSG =
  'SSR collection/prepass is removed: SSR is strictly synchronous';

/** @deprecated SSR prepass has been removed */
export function startCollection(): never {
  throw new Error(`${PREPASS_REMOVED_MSG}; do not call startCollection()`);
}

/** @deprecated SSR prepass has been removed */
export function stopCollection(): ResourcePlan {
  throw new Error(`${PREPASS_REMOVED_MSG}; do not call stopCollection()`);
}

/** @deprecated SSR prepass has been removed */
export function registerResourceIntent(
  _fn: ResourceDescriptor['fn'],
  _deps: unknown[]
): string {
  throw new Error(
    `${PREPASS_REMOVED_MSG}; resource() no longer registers intents for prepass`
  );
}

/** @deprecated SSR prepass has been removed */
export async function resolvePlan(
  _plan: ResourcePlan
): Promise<Record<string, unknown>> {
  throw new Error(
    `${PREPASS_REMOVED_MSG}; async resource plans are not supported`
  );
}

/** @deprecated SSR prepass has been removed */
export function collectResources(_opts: {
  url: string;
  routes: SSRRoute[];
}): ResourcePlan {
  throw new Error(`${PREPASS_REMOVED_MSG}; collectResources is disabled`);
}

/** @deprecated Alias for resolvePlan */
export const resolveResources = resolvePlan;
