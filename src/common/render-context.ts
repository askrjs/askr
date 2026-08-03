import type { SSRData, SSRStyleRegistration } from './ssr';
import type { Route, RouteAuthOptions } from './router';
import { SSRDataMissingError } from './ssr-errors';
import type { RenderableChild } from './vnode';
import {
  withPageFramework,
  type PageRenderEnvelope,
} from './page-render-envelope';
import type { AuthContext } from '@askrjs/auth';

export interface DeferredBoundaryRegistration {
  id: string;
  promise: Promise<unknown>;
  fulfilled(value: unknown): RenderableChild;
  rejected(error: unknown): RenderableChild;
}

export interface SSRPortalHostRegistration {
  token: string;
  automatic: boolean;
}

export interface SSRPortalSlot {
  hasValue: boolean;
  value: RenderableChild | undefined;
  hosts: SSRPortalHostRegistration[];
}

export interface SSRPortalState {
  slots: Map<object, SSRPortalSlot>;
  nextHostId: number;
}

export interface ActiveRenderContext {
  url: string;
  data?: SSRData;
  params?: Record<string, string>;
  routes?: readonly Route[];
  routeAuth?: RouteAuthOptions;
  basePath?: string;
  authContext?: AuthContext;
  signal?: AbortSignal;
  dataRuntime?: unknown;
  queryCache?: Map<string, unknown>;
  resourceDataProvided: boolean;
  mode?: 'ssr' | 'spa';
  queryPrefetch?: import('../data/types').QueryPrefetchContext;
  keyCounter: number;
  renderData: PageRenderEnvelope | null;
  hydrationData: PageRenderEnvelope | null;
  deferredBoundaries: DeferredBoundaryRegistration[];
  ssrStyles: Map<string, SSRStyleRegistration>;
  ssrPortals: SSRPortalState;
}

export interface RenderContextProvider {
  getRenderContext(): ActiveRenderContext | null;
}

let provider: RenderContextProvider = {
  getRenderContext() {
    return null;
  },
};
let hydrationRenderData: PageRenderEnvelope | null = null;
let hydrationKeyCounter = 0;
let hydrationVerificationDepth = 0;
const RESOURCE_VERIFICATION_SNAPSHOTS = 'rv';

export interface ResourceVerificationSnapshot {
  readonly value: unknown;
  readonly pending: boolean;
}

export function configureRenderContextProvider(
  nextProvider: RenderContextProvider
): void {
  provider = nextProvider;
}

export function getActiveRenderContext(): ActiveRenderContext | null {
  return provider.getRenderContext();
}

/** Register request-local CSS produced during SSR without importing the SSR renderer in clients. */
export function registerSSRStyle(id: string, cssText: string): void {
  const context = getActiveRenderContext();
  if (!context?.ssrStyles) return;

  const safeCssText = cssText.replace(/<\/style/gi, '<\\/style');

  const existing = context.ssrStyles.get(id);
  if (existing && existing.cssText !== safeCssText) {
    throw new RangeError(
      `SSR style registration collision for ${JSON.stringify(id)}.`
    );
  }
  context.ssrStyles.set(id, { id, cssText: safeCssText });
}

export function getCurrentRenderData(): PageRenderEnvelope | null {
  const ctx = getActiveRenderContext();
  return ctx?.renderData ?? hydrationRenderData;
}

export function resetRenderKeyCounter(): void {
  const ctx = getActiveRenderContext();
  if (ctx) {
    ctx.keyCounter = 0;
  }
}

export function getNextRenderKey(): string {
  const ctx = getActiveRenderContext();
  if (ctx) {
    return `r:${ctx.keyCounter++}`;
  }

  if (hydrationRenderData) {
    return `r:${hydrationKeyCounter++}`;
  }

  return 'r:0';
}

export function startHydrationRenderPhase(data: PageRenderEnvelope): void {
  hydrationRenderData = data;
  hydrationKeyCounter = 0;
}

export function stopHydrationRenderPhase(): void {
  hydrationRenderData = null;
  hydrationKeyCounter = 0;
}

/** @internal Run one synchronous client-side markup verification pass. */
export function withHydrationVerificationRender<T>(fn: () => T): T {
  hydrationVerificationDepth += 1;
  try {
    return fn();
  } finally {
    hydrationVerificationDepth -= 1;
  }
}

/** @internal Whether resources should reflect their server pending snapshot. */
export function isHydrationVerificationRender(): boolean {
  return hydrationVerificationDepth > 0;
}

/** @internal Read a server-captured resource branch without invoking its loader. */
export function getResourceVerificationSnapshot(
  key: string
): ResourceVerificationSnapshot | null {
  const snapshots = getCurrentRenderData()?.framework[
    RESOURCE_VERIFICATION_SNAPSHOTS
  ];
  if (!snapshots || typeof snapshots !== 'object' || Array.isArray(snapshots)) {
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(snapshots, key)) return null;
  const snapshot = (snapshots as Record<string, unknown>)[key];
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return null;
  }
  const candidate = snapshot as Partial<ResourceVerificationSnapshot>;
  return typeof candidate.pending === 'boolean'
    ? { value: candidate.value, pending: candidate.pending }
    : null;
}

/** @internal Preserve a JSON-safe server branch solely for markup verification. */
export function recordResourceVerificationSnapshot(
  key: string,
  snapshot: ResourceVerificationSnapshot
): void {
  const ctx = getActiveRenderContext();
  const envelope = ctx?.hydrationData;
  if (!ctx || !envelope) return;

  const current = envelope.framework[RESOURCE_VERIFICATION_SNAPSHOTS];
  const snapshots =
    current && typeof current === 'object' && !Array.isArray(current)
      ? (current as Readonly<Record<string, unknown>>)
      : {};
  ctx.hydrationData = withPageFramework(envelope, {
    ...envelope.framework,
    [RESOURCE_VERIFICATION_SNAPSHOTS]: {
      ...snapshots,
      [key]: snapshot,
    },
  });
}

export function startRenderPhase(data: PageRenderEnvelope | null): void {
  const ctx = getActiveRenderContext();
  if (ctx) {
    ctx.renderData = data ?? null;
    ctx.keyCounter = 0;
  }
}

export function stopRenderPhase(): void {
  const ctx = getActiveRenderContext();
  if (ctx) {
    ctx.renderData = null;
    ctx.keyCounter = 0;
  }
}

export function throwSSRDataMissing(): never {
  throw new SSRDataMissingError();
}
