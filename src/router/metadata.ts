import type {
  RouteContext,
  RouteMetaContext,
  RouteMeta,
  RouteMetaSource,
  RouteRecord,
} from '../common/router';

import { emptyRouteSearch, parseRouteSearch } from './route-search';

function freezeMeta(meta: RouteMeta): Readonly<RouteMeta> {
  if (meta.openGraph) Object.freeze(meta.openGraph);
  if (meta.links) {
    for (const link of meta.links) Object.freeze(link);
    Object.freeze(meta.links);
  }
  if (Array.isArray(meta.jsonLd)) Object.freeze(meta.jsonLd);
  if (meta.html) Object.freeze(meta.html);
  return Object.freeze(meta);
}

function mergeMeta(current: RouteMeta, next: RouteMeta): RouteMeta {
  return {
    ...(current.title !== undefined ? { title: current.title } : {}),
    ...(current.description !== undefined
      ? { description: current.description }
      : {}),
    ...(current.canonical !== undefined
      ? { canonical: current.canonical }
      : {}),
    ...(current.robots !== undefined ? { robots: current.robots } : {}),
    ...(next.title !== undefined ? { title: next.title } : {}),
    ...(next.description !== undefined
      ? { description: next.description }
      : {}),
    ...(next.canonical !== undefined ? { canonical: next.canonical } : {}),
    ...(next.robots !== undefined ? { robots: next.robots } : {}),
    ...(current.openGraph || next.openGraph
      ? { openGraph: { ...current.openGraph, ...next.openGraph } }
      : {}),
    ...(current.links || next.links
      ? { links: [...(current.links ?? []), ...(next.links ?? [])] }
      : {}),
    ...(current.jsonLd || next.jsonLd
      ? {
          jsonLd: [
            ...(current.jsonLd === undefined
              ? []
              : Array.isArray(current.jsonLd)
                ? current.jsonLd
                : [current.jsonLd]),
            ...(next.jsonLd === undefined
              ? []
              : Array.isArray(next.jsonLd)
                ? next.jsonLd
                : [next.jsonLd]),
          ],
        }
      : {}),
    ...(current.html || next.html
      ? { html: { ...current.html, ...next.html } }
      : {}),
  };
}

function metadataSources(record: RouteRecord): readonly RouteMetaSource[] {
  if (record.metaChain) return record.metaChain;
  return record.options.meta ? [record.options.meta] : [];
}

/** Resolve a route's merged {@link RouteMeta} by running its metadata chain against `context`. */
export function resolveRouteMeta(
  record: RouteRecord,
  context: RouteContext & { data?: unknown }
): Promise<Readonly<RouteMeta>> {
  return resolveRouteMetaInternal(record, context);
}

/** Private route-owner fence; the public metadata resolver stays unchanged. */
export function resolveOwnedRouteMeta(
  record: RouteRecord,
  context: RouteContext & { data?: unknown },
  assertCurrent: () => void
): Promise<Readonly<RouteMeta>> {
  return resolveRouteMetaInternal(record, context, assertCurrent);
}

async function resolveRouteMetaInternal(
  record: RouteRecord,
  input: RouteContext & { data?: unknown },
  assertCurrent?: () => void
): Promise<Readonly<RouteMeta>> {
  assertCurrent?.();
  // Callers that build their own context need not parse the query themselves.
  const context: RouteMetaContext = {
    ...input,
    searchParams:
      input.searchParams ??
      (record.options.search
        ? parseRouteSearch(record.options.search, input.search)
        : emptyRouteSearch()),
  };
  let resolved: RouteMeta = record.options.title
    ? { title: record.options.title }
    : {};

  // Sources are independent: start them all, then merge in declaration order.
  const sources = metadataSources(record);
  const settled = await Promise.all(
    sources.map(async (source) =>
      typeof source === 'function' ? source(context) : source
    )
  );
  assertCurrent?.();
  for (const next of settled) resolved = mergeMeta(resolved, next);

  return freezeMeta(resolved);
}

/**
 * What the document declared before any route metadata was written: a shell
 * `<title>` and the root `lang`/`dir`. A route without its own title,
 * language or direction restores these.
 */
interface DocumentBaseline {
  title: HTMLTitleElement | null;
  titleText: string;
  lang: string | null;
  dir: string | null;
  /** What the router last wrote; only that is reverted, never app edits. */
  written: { title?: string; lang?: string; dir?: string };
}

const documentBaselines = new WeakMap<Document, DocumentBaseline>();

/**
 * Forget the captured baseline (router reset in tests and teardown); the next
 * reconcile reads the document anew. Apps booting into the same document
 * share one baseline, captured before any of them wrote to the head.
 */
export function resetRouteMetaBaseline(
  target: Document | undefined = globalThis.document
): void {
  if (target) documentBaselines.delete(target);
}

function documentBaseline(target: Document): DocumentBaseline {
  let baseline = documentBaselines.get(target);
  if (!baseline) {
    const title = target.head.querySelector<HTMLTitleElement>(
      'title:not([data-askr-head])'
    );
    baseline = {
      title,
      titleText: title?.textContent ?? '',
      lang: target.documentElement.getAttribute('lang'),
      dir: target.documentElement.getAttribute('dir'),
      written: {},
    };
    documentBaselines.set(target, baseline);
  }
  return baseline;
}

/**
 * Write a route's root attribute, or put back the document's own value when
 * the route declares none and the current value is still the router's.
 * A value the application set itself is left alone.
 */
function writeRootAttribute(
  target: Document,
  name: 'lang' | 'dir',
  value: string | undefined,
  baseline: DocumentBaseline
): void {
  const root = target.documentElement;
  if (value) {
    if (root.getAttribute(name) !== value) root.setAttribute(name, value);
    baseline.written[name] = value;
    return;
  }
  const written = baseline.written[name];
  if (written === undefined || root.getAttribute(name) !== written) return;
  baseline.written[name] = undefined;
  const original = baseline[name];
  if (original === null) root.removeAttribute(name);
  else root.setAttribute(name, original);
}

/**
 * Write a route's metadata to the document head after a client navigation.
 *
 * Askr-owned nodes (marked `data-askr-head`, as SSR writes them) are replaced
 * and nothing else is removed. A shell `<title>` the document already had is
 * updated in place, because the browser reads the first `<title>`; a route
 * without a title restores its original text. The root `lang` and `dir`
 * attributes are restored the same way.
 */
export function reconcileRouteMeta(
  meta: Readonly<RouteMeta>,
  target: Document = document
): void {
  const baseline = documentBaseline(target);
  for (const node of Array.from(
    target.head.querySelectorAll('[data-askr-head]')
  )) {
    node.remove();
  }
  const own = (element: HTMLElement): HTMLElement => {
    element.setAttribute('data-askr-head', '');
    return element;
  };
  const shellTitle =
    baseline.title && baseline.title.parentNode === target.head
      ? baseline.title
      : null;
  const appendMeta = (
    attribute: 'name' | 'property',
    name: string,
    content: string
  ) => {
    const element = own(target.createElement('meta'));
    element.setAttribute(attribute, name);
    element.setAttribute('content', content);
    target.head.append(element);
  };
  if (shellTitle) {
    if (meta.title !== undefined) {
      if (shellTitle.textContent !== meta.title) {
        shellTitle.textContent = meta.title;
      }
      baseline.written.title = meta.title;
    } else if (
      baseline.written.title !== undefined &&
      shellTitle.textContent === baseline.written.title
    ) {
      // Only the router's own title is put back; an app-updated title stays.
      baseline.written.title = undefined;
      shellTitle.textContent = baseline.titleText;
    }
  } else if (meta.title !== undefined) {
    const element = own(target.createElement('title'));
    element.textContent = meta.title;
    target.head.append(element);
  }
  if (meta.description !== undefined)
    appendMeta('name', 'description', meta.description);
  if (meta.canonical !== undefined) {
    const element = own(target.createElement('link'));
    element.setAttribute('rel', 'canonical');
    element.setAttribute('href', meta.canonical);
    target.head.append(element);
  }
  if (meta.robots !== undefined) appendMeta('name', 'robots', meta.robots);
  for (const [property, content] of Object.entries(meta.openGraph ?? {})) {
    appendMeta(
      'property',
      property.startsWith('og:') ? property : `og:${property}`,
      content
    );
  }
  for (const link of meta.links ?? []) {
    const element = own(target.createElement('link'));
    for (const [name, value] of Object.entries(link)) {
      if (LINK_ATTRIBUTES.has(name.toLowerCase()))
        element.setAttribute(name.toLowerCase(), value);
    }
    target.head.append(element);
  }
  if (meta.jsonLd !== undefined) {
    const values = Array.isArray(meta.jsonLd) ? meta.jsonLd : [meta.jsonLd];
    for (const value of values) {
      const element = own(target.createElement('script'));
      element.setAttribute('type', 'application/ld+json');
      element.textContent = JSON.stringify(value);
      target.head.append(element);
    }
  }
  writeRootAttribute(target, 'lang', meta.html?.lang || undefined, baseline);
  writeRootAttribute(target, 'dir', meta.html?.dir || undefined, baseline);
}

const LINK_ATTRIBUTES = new Set([
  'rel',
  'href',
  'as',
  'crossorigin',
  'fetchpriority',
  'hreflang',
  'imagesizes',
  'imagesrcset',
  'media',
  'referrerpolicy',
  'sizes',
  'type',
]);

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function ownedAttribute(): string {
  return ' data-askr-head=""';
}

function serializeLink(link: Readonly<Record<string, string>>): string {
  const entries = Object.entries(link)
    .map(([name, value]) => [name.toLowerCase(), value] as const)
    .filter(([name]) => LINK_ATTRIBUTES.has(name))
    .sort(([left], [right]) => {
      const order = (name: string) =>
        name === 'rel' ? 0 : name === 'href' ? 1 : 2;
      return order(left) - order(right) || left.localeCompare(right);
    });
  return `<link${ownedAttribute()}${entries
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('')}>`;
}

function serializeJsonLd(value: unknown): string {
  const json = JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `<script${ownedAttribute()} type="application/ld+json">${json}</script>`;
}

/** Render a {@link RouteMeta} to the `<title>`/`<meta>`/`<link>`/JSON-LD markup for the document `<head>`. */
export function serializeRouteMeta(meta: RouteMeta): string {
  const output: string[] = [];
  if (meta.title !== undefined) {
    output.push(`<title${ownedAttribute()}>${escapeText(meta.title)}</title>`);
  }
  if (meta.description !== undefined) {
    output.push(
      `<meta${ownedAttribute()} name="description" content="${escapeAttribute(meta.description)}">`
    );
  }
  if (meta.canonical !== undefined) {
    output.push(
      `<link${ownedAttribute()} rel="canonical" href="${escapeAttribute(meta.canonical)}">`
    );
  }
  if (meta.robots !== undefined) {
    output.push(
      `<meta${ownedAttribute()} name="robots" content="${escapeAttribute(meta.robots)}">`
    );
  }
  for (const [property, content] of Object.entries(meta.openGraph ?? {}).sort(
    ([left], [right]) => left.localeCompare(right)
  )) {
    const name = property.startsWith('og:') ? property : `og:${property}`;
    output.push(
      `<meta${ownedAttribute()} property="${escapeAttribute(name)}" content="${escapeAttribute(content)}">`
    );
  }
  for (const link of meta.links ?? []) output.push(serializeLink(link));
  if (meta.jsonLd !== undefined) {
    const values = Array.isArray(meta.jsonLd) ? meta.jsonLd : [meta.jsonLd];
    for (const value of values) output.push(serializeJsonLd(value));
  }
  return output.join('');
}
