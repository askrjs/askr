import { renderResolvedToStringSync, type SSRRoute } from './index';
import type { SSRData } from './context';
import type { ResolvedRoute } from '../common/router';
import { SSR_RENDER_DATA_ATTR } from '../common/ssr';

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
  routes: SSRRoute[];
  resolved: ResolvedRoute;
  options?: { seed?: number; data?: SSRData };
}): boolean {
  const { root, url, routes, resolved, options } = opts;

  const expected = renderResolvedToStringSync({
    url,
    routes,
    handler: resolved.handler,
    params: resolved.params,
    options,
  });

  return (
    normalizeHydrationHtml(root.innerHTML) === normalizeHydrationHtml(expected)
  );
}
