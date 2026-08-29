import type { SSRData } from './context';
import type {
  ResolvedRoute,
  RouteRegistry,
  RouteRenderResult,
} from '../common/router';
import type { DataRuntime } from '../data/types';
import { SSR_RENDER_DATA_ATTR } from '../common/ssr';
import { renderResolvedForHydrationSync } from './render-resolved';
import type { PageRenderEnvelope } from '../common/page-render-envelope';
import { getHydrationRenderUrl } from '../common/page-render-envelope';
import { withHydrationVerificationRender } from '../common/render-context';
import { getRouteRenderContext } from '../router/resolution';
import { currentAuth } from '../router/auth';

const SSR_STYLE_REGISTRY_SELECTOR = 'style[data-askr-style-registry]';

function normalizeHydrationHtml(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const carrier of Array.from(
    template.content.querySelectorAll(
      `script[${SSR_RENDER_DATA_ATTR}],${SSR_STYLE_REGISTRY_SELECTOR}`
    )
  )) {
    carrier.remove();
  }
  return template.innerHTML.replace(/<!--[\s\S]*?-->/g, '');
}

export function verifyHydrationSyncForUrl(opts: {
  root: Element;
  url: string;
  registry: RouteRegistry;
  resolved: ResolvedRoute;
  options?: {
    seed?: number;
    data?: SSRData;
    dataRuntime?: DataRuntime;
    envelope?: PageRenderEnvelope;
    cspNonce?: string;
  };
}): boolean {
  const { root, url, registry, resolved, options } = opts;
  const verificationUrl =
    getHydrationRenderUrl(options?.envelope) ??
    new URL(url, 'http://localhost').pathname;
  const authContext =
    getRouteRenderContext(resolved as RouteRenderResult)?.auth ?? currentAuth();
  const expected = withHydrationVerificationRender(() =>
    renderResolvedForHydrationSync(
      {
        url: verificationUrl,
        registry,
        handler: resolved.handler,
        params: resolved.params,
        options,
      },
      authContext
    )
  );

  return (
    normalizeHydrationHtml(root.innerHTML) === normalizeHydrationHtml(expected)
  );
}
