import type { SSRData } from './ssr';
import type { Route, RouteAuthOptions } from './router';
import { SSRDataMissingError } from './ssr-errors';

export interface ActiveRenderContext {
  url: string;
  data?: SSRData;
  params?: Record<string, string>;
  routes?: readonly Route[];
  routeAuth?: RouteAuthOptions;
  signal?: AbortSignal;
  dataRuntime?: unknown;
  queryCache?: Map<string, unknown>;
  keyCounter: number;
  renderData: Record<string, unknown> | null;
}

export interface RenderContextProvider {
  getRenderContext(): ActiveRenderContext | null;
}

let provider: RenderContextProvider = {
  getRenderContext() {
    return null;
  },
};
let hydrationRenderData: Record<string, unknown> | null = null;
let hydrationKeyCounter = 0;

export function configureRenderContextProvider(
  nextProvider: RenderContextProvider
): void {
  provider = nextProvider;
}

export function getActiveRenderContext(): ActiveRenderContext | null {
  return provider.getRenderContext();
}

export function getCurrentRenderData(): Record<string, unknown> | null {
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

export function startHydrationRenderPhase(data: Record<string, unknown>): void {
  hydrationRenderData = data;
  hydrationKeyCounter = 0;
}

export function stopHydrationRenderPhase(): void {
  hydrationRenderData = null;
  hydrationKeyCounter = 0;
}

export function startRenderPhase(data: Record<string, unknown> | null): void {
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
