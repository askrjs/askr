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

// Hydration and key bookkeeping the renderers write, not application markup.
const RENDERER_BOOKKEEPING_ATTRS = [
  'data-skip-hydrate',
  'data-key',
  'data-askr-key-kind',
];

/**
 * Parsed declarations in a canonical order. Each parsed longhand is unique, so
 * order carries no meaning here, but the DOM renderer may reorder properties
 * it rewrites.
 */
function normalizeStyleDeclarations(style: CSSStyleDeclaration): string {
  const declarations: string[] = [];
  for (let index = 0; index < style.length; index += 1) {
    const name = style.item(index);
    const priority = style.getPropertyPriority(name);
    declarations.push(
      `${name}: ${style.getPropertyValue(name)}${priority ? ` !${priority}` : ''};`
    );
  }
  return declarations.sort().join(' ');
}

/**
 * Serialize markup in a form that is stable across the SSR serializer and the
 * DOM renderer: transport carriers, comments (range anchors) and the
 * key and `data-skip-hydrate` bookkeeping the renderers add are dropped, and style
 * attributes are re-serialized through the CSSOM so `color:red;` and the
 * DOM's `color: red;` compare equal.
 */
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
  for (const name of RENDERER_BOOKKEEPING_ATTRS) {
    for (const element of Array.from(
      template.content.querySelectorAll(`[${name}]`)
    )) {
      element.removeAttribute(name);
    }
  }
  for (const element of Array.from(
    template.content.querySelectorAll('[style]')
  )) {
    const style = (element as HTMLElement | SVGElement).style;
    if (!style) continue;
    const cssText = normalizeStyleDeclarations(style);
    if (cssText) element.setAttribute('style', cssText);
    else element.removeAttribute('style');
  }
  return template.innerHTML.replace(/<!--[\s\S]*?-->/g, '');
}

/**
 * Whether the client renders the same URL the server markup was rendered
 * for. A static page opened with a client-only query or hash is verified
 * against its queryless render URL, then hydration applies the browser URL on
 * purpose, so its client output legitimately differs.
 */
function clientRendersServerUrl(
  url: string,
  envelope: PageRenderEnvelope | undefined
): boolean {
  const live = new URL(url, 'http://localhost');
  const renderUrl = getHydrationRenderUrl(envelope);
  const rendered = new URL(renderUrl ?? live.pathname, 'http://localhost');
  return rendered.search === live.search && rendered.hash === live.hash;
}

/**
 * Capture the server markup under `root` before the client renderer touches
 * it, normalized for {@link verifyClientHydrationMarkup}. Returns `null` when
 * the client output is not expected to reproduce it because the page is
 * hydrated at a different URL than it was rendered for.
 */
export function captureServerHydrationMarkup(
  root: Element,
  url: string,
  envelope?: PageRenderEnvelope
): string | null {
  const html = root.innerHTML;
  if (!clientRendersServerUrl(url, envelope)) {
    return null;
  }
  return normalizeHydrationHtml(html);
}

/**
 * Whether the markup the client renderer left under `root` after hydrating
 * matches the server markup captured before it ran. Hydration reconciles the
 * server DOM in place, so an SSR/client renderer divergence shows up here even
 * when a fresh server render reproduces the server HTML exactly.
 */
export function verifyClientHydrationMarkup(
  root: Element,
  serverMarkup: string
): boolean {
  return normalizeHydrationHtml(root.innerHTML) === serverMarkup;
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
