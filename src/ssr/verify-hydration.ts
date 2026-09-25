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

const HYDRATION_SKIP_ATTR = 'data-skip-hydrate';

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
 * `data-skip-hydrate` markers hydration itself adds are dropped, and style
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
  for (const element of Array.from(
    template.content.querySelectorAll(`[${HYDRATION_SKIP_ATTR}]`)
  )) {
    element.removeAttribute(HYDRATION_SKIP_ATTR);
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
 * Capture the server markup under `root` before the client renderer touches
 * it, normalized for {@link verifyClientHydrationMarkup}.
 */
export function captureServerHydrationMarkup(root: Element): string {
  return normalizeHydrationHtml(root.innerHTML);
}

/**
 * Whether the markup the client renderer left under `root` after hydrating
 * matches the server markup captured before it ran. Hydration reconciles the
 * server DOM in place, so any SSR/client renderer divergence shows up as a
 * difference here.
 */
export function verifyClientHydrationMarkup(
  root: Element,
  serverMarkup: string
): boolean {
  const __c = normalizeHydrationHtml(root.innerHTML);
  if (__c !== serverMarkup) require('fs').appendFileSync('/private/tmp/claude-501/-Users-jrepanich-Code-askrjs/d4bd6e74-2aac-4d1f-ba19-d944836e3d93/scratchpad/mm.txt', (globalThis as any).expect?.getState?.().currentTestName + '\n S: ' + serverMarkup + '\n C: ' + __c + '\n R: ' + root.innerHTML + JSON.stringify(Array.from(root.firstChild!.childNodes).map((n: any) => [n.nodeName, n.data, n.outerHTML, n.parentNode === root.firstChild])) + '\n\n');
  return __c === serverMarkup;
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
