import { renderResolvedToStringSync, type SSRRoute } from './index';
import type { SSRData } from './context';
import type { ResolvedRoute } from '../common/router';

function normalizeHydrationHtml(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
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
