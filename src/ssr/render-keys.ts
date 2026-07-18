/**
 * SSR Data Management
 *
 * Manages render-phase keying for deterministic SSR data lookup.
 * All state is stored in the per-render context for concurrency safety.
 */

import {
  getCurrentRenderData as getCommonCurrentRenderData,
  getNextRenderKey,
  resetRenderKeyCounter,
  startHydrationRenderPhase as startCommonHydrationRenderPhase,
  startRenderPhase as startCommonRenderPhase,
  stopHydrationRenderPhase as stopCommonHydrationRenderPhase,
  stopRenderPhase as stopCommonRenderPhase,
} from '../common/render-context';
import {
  createPageRenderEnvelope,
  isPageRenderEnvelope,
  type PageRenderEnvelope,
} from '../common/page-render-envelope';

export function getCurrentRenderData(): Record<string, unknown> | null {
  return getCommonCurrentRenderData()?.resources ?? null;
}

export function resetKeyCounter() {
  resetRenderKeyCounter();
}

export function getNextKey(): string {
  return getNextRenderKey();
}

export function startHydrationRenderPhase(
  data: Record<string, unknown> | PageRenderEnvelope
) {
  startCommonHydrationRenderPhase(
    isPageRenderEnvelope(data)
      ? data
      : createPageRenderEnvelope({ resources: data })
  );
}

export function stopHydrationRenderPhase() {
  stopCommonHydrationRenderPhase();
}

export function startRenderPhase(
  data: Record<string, unknown> | PageRenderEnvelope | null
) {
  startCommonRenderPhase(
    data === null
      ? null
      : isPageRenderEnvelope(data)
        ? data
        : createPageRenderEnvelope({ resources: data })
  );
}

export function stopRenderPhase() {
  stopCommonRenderPhase();
}
