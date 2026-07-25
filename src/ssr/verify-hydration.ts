import type { SSRData } from './context';
import type { ResolvedRoute, RouteRegistry } from '../common/router';
import type { DataRuntime } from '../data/types';
import { SSR_RENDER_DATA_ATTR } from '../common/ssr';
import { renderResolvedToStringSync } from './render-resolved';
import type { PageRenderEnvelope } from '../common/page-render-envelope';

function normalizeHydrationHtml(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const script of Array.from(
    template.content.querySelectorAll(`script[${SSR_RENDER_DATA_ATTR}]`)
  )) {
    script.remove();
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
  const expected = renderResolvedToStringSync({
    url,
    registry,
    handler: resolved.handler,
    params: resolved.params,
    options,
  });

  return (
    normalizeHydrationHtml(root.innerHTML) === normalizeHydrationHtml(expected)
  );
}
