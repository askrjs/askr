import type {
  RouteContext,
  RouteMeta,
  RouteMetaSource,
  RouteRecord,
} from '../common/router';

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

export async function resolveRouteMeta(
  record: RouteRecord,
  context: RouteContext
): Promise<Readonly<RouteMeta>> {
  let resolved: RouteMeta = record.options.title
    ? { title: record.options.title }
    : {};

  for (const source of metadataSources(record)) {
    const next = typeof source === 'function' ? await source(context) : source;
    resolved = mergeMeta(resolved, next);
  }

  return freezeMeta(resolved);
}

/** Replace only Askr-owned head nodes after a successful client navigation. */
export function reconcileRouteMeta(
  meta: Readonly<RouteMeta>,
  target: Document = document
): void {
  for (const node of Array.from(
    target.head.querySelectorAll('[data-askr-head]')
  )) {
    node.remove();
  }
  const own = (element: HTMLElement): HTMLElement => {
    element.setAttribute('data-askr-head', '');
    return element;
  };
  const appendMeta = (attribute: 'name' | 'property', name: string, content: string) => {
    const element = own(target.createElement('meta'));
    element.setAttribute(attribute, name);
    element.setAttribute('content', content);
    target.head.append(element);
  };
  if (meta.title !== undefined) {
    const element = own(target.createElement('title'));
    element.textContent = meta.title;
    target.head.append(element);
  }
  if (meta.description !== undefined) appendMeta('name', 'description', meta.description);
  if (meta.canonical !== undefined) {
    const element = own(target.createElement('link'));
    element.setAttribute('rel', 'canonical');
    element.setAttribute('href', meta.canonical);
    target.head.append(element);
  }
  if (meta.robots !== undefined) appendMeta('name', 'robots', meta.robots);
  for (const [property, content] of Object.entries(meta.openGraph ?? {})) {
    appendMeta('property', property.startsWith('og:') ? property : `og:${property}`, content);
  }
  for (const link of meta.links ?? []) {
    const element = own(target.createElement('link'));
    for (const [name, value] of Object.entries(link)) {
      if (LINK_ATTRIBUTES.has(name.toLowerCase())) element.setAttribute(name.toLowerCase(), value);
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
  if (meta.html?.lang)
    target.documentElement.setAttribute('lang', meta.html.lang);
  if (meta.html?.dir) target.documentElement.setAttribute('dir', meta.html.dir);
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
