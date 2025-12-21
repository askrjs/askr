import type { JSXElement } from '../jsx/types';
import type { Props } from '../shared/types';
import type { RenderSink } from './sink';
import { SSRInvariantError } from './errors';
import { withSSRContext, type SSRContext } from './context';

type VNode = {
  type: string | Component;
  props?: Props;
  // Some JSX runtimes put children on `props.children`, others on `children`.
  children?: unknown[];
};

export type Component = (
  props: Props,
  context?: { signal?: AbortSignal }
) => VNode | JSXElement | string | number | null;

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const escapeCache = new Map<string, string>();

function escapeText(text: string): string {
  const cached = escapeCache.get(text);
  if (cached) return cached;

  const str = String(text);
  if (!str.includes('&') && !str.includes('<') && !str.includes('>')) {
    if (escapeCache.size < 256) escapeCache.set(text, str);
    return str;
  }

  const result = str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  if (escapeCache.size < 256) escapeCache.set(text, result);
  return result;
}

function escapeAttr(value: string): string {
  const str = String(value);
  if (
    !str.includes('&') &&
    !str.includes('"') &&
    !str.includes("'") &&
    !str.includes('<') &&
    !str.includes('>')
  ) {
    return str;
  }
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function styleObjToCss(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '';
  // camelCase -> kebab-case
  let out = '';
  for (const [k, v] of entries) {
    if (v === null || v === undefined || v === false) continue;
    const prop = k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    out += `${prop}:${String(v)};`;
  }
  return out;
}

function renderAttrs(props?: Props): string {
  if (!props || typeof props !== 'object') return '';

  let result = '';
  for (const [key, value] of Object.entries(props)) {
    // Skip children in attrs
    if (key === 'children') continue;

    // Skip event handlers: onClick, onChange, ...
    if (key.startsWith('on') && key[2] === key[2]?.toUpperCase()) continue;

    // Skip internal props
    if (key.startsWith('_')) continue;

    const attrName = key === 'class' || key === 'className' ? 'class' : key;

    if (attrName === 'style') {
      const css = typeof value === 'string' ? value : styleObjToCss(value);
      if (css === null) continue;
      if (css === '') continue;
      result += ` style="${escapeAttr(css)}"`;
      continue;
    }

    if (value === true) {
      result += ` ${attrName}`;
    } else if (value === false || value === null || value === undefined) {
      continue;
    } else {
      result += ` ${attrName}="${escapeAttr(String(value))}"`;
    }
  }

  return result;
}

function isVNodeLike(x: unknown): x is VNode | JSXElement {
  return !!x && typeof x === 'object' && 'type' in (x as Record<string, unknown>);
}

function normalizeChildren(node: unknown): unknown[] {
  // Prefer explicit node.children; fallback to props.children
  const n = node as Record<string, unknown> | null | undefined;
  const direct = Array.isArray(n?.children) ? (n?.children as unknown[]) : null;
  const fromProps = (n?.props as Record<string, unknown> | undefined)?.children as unknown;

  const raw = direct ?? fromProps;

  if (raw === null || raw === undefined || raw === false) return [];
  if (Array.isArray(raw)) return raw;
  return [raw];
}

// Note: renderChildToSink was removed in favor of direct renderNodeToSink inlined calls


function renderChildrenToSink(
  children: unknown[],
  sink: RenderSink,
  ctx: SSRContext
) {
  for (const c of children) renderNodeToSink(c as VNode | JSXElement | string | number | null, sink, ctx);
}

function executeComponent(
  type: Component,
  props: Props | undefined,
  ctx: SSRContext
): unknown {
  // Synchronous only. If a user returns a Promise, that's a hard error.
  const res = type(props ?? {}, { signal: ctx.signal });
  if (res && typeof res === 'object' && 'then' in res && typeof ((res as unknown) as PromiseLike<unknown>).then === 'function') {
    throw new SSRInvariantError(
      'SSR does not support async components. Return synchronously and preload data via SSR data prepass.'
    );
  }
  return res;
}

export function renderNodeToSink(
  node: VNode | JSXElement | string | number | null,
  sink: RenderSink,
  ctx: SSRContext
) {
  if (node === null || node === undefined) return;

  if (typeof node === 'string') {
    sink.write(escapeText(node));
    return;
  }
  if (typeof node === 'number') {
    sink.write(escapeText(String(node)));
    return;
  }

  if (!isVNodeLike(node)) return;

  const { type, props } = node as VNode;

  // Function component
  if (typeof type === 'function') {
    const out = withSSRContext(ctx, () => executeComponent(type as Component, props, ctx));
    renderNodeToSink(out as VNode | JSXElement | string | number | null, sink, ctx);
    return;
  }

  // Element node
  const tag = String(type);
  const attrs = renderAttrs(props);

  // void element
  if (VOID_ELEMENTS.has(tag)) {
    sink.write(`<${tag}${attrs} />`);
    return;
  }

  sink.write(`<${tag}${attrs}>`);
  const children = normalizeChildren(node);
  renderChildrenToSink(children, sink, ctx);
  sink.write(`</${tag}>`);
}
