import type { SSRData } from './ssr';
import type { Route, RouteAuthOptions } from './router';

export interface ActiveRenderContext {
  url: string;
  data?: SSRData;
  params?: Record<string, string>;
  routes?: readonly Route[];
  routeAuth?: RouteAuthOptions;
  signal?: AbortSignal;
  queryCache?: Map<string, unknown>;
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

export function configureRenderContextProvider(
  nextProvider: RenderContextProvider
): void {
  provider = nextProvider;
}

export function getActiveRenderContext(): ActiveRenderContext | null {
  return provider.getRenderContext();
}
