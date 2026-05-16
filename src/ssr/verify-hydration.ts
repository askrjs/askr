import { renderResolvedToStringSync, type SSRRoute } from './index';
import type { SSRData } from './context';
import * as RouteModule from '../router/route';

function normalizeHydrationHtml(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.innerHTML.replace(/<!--.*?-->/g, '');
}

export function verifyHydrationSyncForUrl(opts: {
  root: Element;
  url: string;
  routes: SSRRoute[];
  options?: { seed?: number; data?: SSRData };
}): boolean {
  const { root, url, routes, options } = opts;
  const requestUrl = new URL(url, 'http://localhost');
  const resolved = RouteModule.resolveRouteFromRoutes(
    requestUrl.pathname,
    routes
  );

  if (!resolved) {
    return false;
  }

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
