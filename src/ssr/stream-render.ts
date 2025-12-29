import type { JSXElement } from '../common/jsx';
import type { Props } from '../common/props';
import type { RenderSink } from './sink';
import type { VNode, SSRComponent } from './types';
import { Fragment } from '../jsx';
import {
  withSSRContext,
  type SSRContext,
  throwSSRDataMissing,
} from './context';
import { VOID_ELEMENTS, escapeText } from './escape';
import { renderAttrs } from './attrs';

// Re-export for backwards compatibility
export type Component = SSRComponent;

function isVNodeLike(x: unknown): x is VNode | JSXElement {
  return (
    !!x && typeof x === 'object' && 'type' in (x as Record<string, unknown>)
  );
}

function normalizeChildren(node: unknown): unknown[] {
  // Prefer explicit node.children; fallback to props.children
  const n = node as Record<string, unknown> | null | undefined;
  const direct = Array.isArray(n?.children) ? (n?.children as unknown[]) : null;
  const fromProps = (n?.props as Record<string, unknown> | undefined)
    ?.children as unknown;

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
  for (const c of children)
    renderNodeToSink(
      c as VNode | JSXElement | string | number | null,
      sink,
      ctx
    );
}

function isPromiseLike(x: unknown): x is PromiseLike<unknown> {
  if (!x || typeof x !== 'object') return false;
  const then = (x as { then?: unknown }).then;
  return typeof then === 'function';
}

function executeComponent(
  type: Component,
  props: Props | undefined,
  ctx: SSRContext
): unknown {
  // Synchronous only. If a user returns a Promise, that's a hard error.
  const res = type(props ?? {}, { signal: ctx.signal });
  if (isPromiseLike(res)) {
    // Use centralized SSR failure mode — async components are not allowed during
    // synchronous SSR and must be pre-resolved by the developer.
    throwSSRDataMissing();
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

  // Fragment: render children in-place
  if (
    typeof type === 'symbol' &&
    (type === Fragment || String(type) === 'Symbol(Fragment)')
  ) {
    const children = normalizeChildren(node);
    renderChildrenToSink(children, sink, ctx);
    return;
  }

  // Function component
  if (typeof type === 'function') {
    const out = withSSRContext(ctx, () =>
      executeComponent(type as Component, props, ctx)
    );
    renderNodeToSink(
      out as VNode | JSXElement | string | number | null,
      sink,
      ctx
    );
    return;
  }

  // Element node
  const tag = String(type);
  const { attrs, dangerousHtml } = renderAttrs(props, {
    returnDangerousHtml: true,
  });

  // void element
  if (VOID_ELEMENTS.has(tag)) {
    sink.write(`<${tag}${attrs} />`);
    return;
  }

  sink.write(`<${tag}${attrs}>`);
  // If dangerouslySetInnerHTML is set, use it instead of children
  if (dangerousHtml !== undefined) {
    sink.write(dangerousHtml);
  } else {
    const children = normalizeChildren(node);
    renderChildrenToSink(children, sink, ctx);
  }
  sink.write(`</${tag}>`);
}
