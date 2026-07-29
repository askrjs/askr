import type { SSRData, SSRStyleRegistration } from './ssr';
import type { Route, RouteAuthOptions } from './router';
import { SSRDataMissingError } from './ssr-errors';
import type { RenderableChild } from './vnode';
import type { PageRenderEnvelope } from './page-render-envelope';
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

export function configureRenderContextProvider(
  nextProvider: RenderContextProvider
): void {
  provider = nextProvider;
}

export function getActiveRenderContext(): ActiveRenderContext | null {
  return provider.getRenderContext();
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
