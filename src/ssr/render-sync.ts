import type { JSXElement } from '../common/jsx';
import { __CONTROL_BOUNDARY__ } from '../common/control';
import type { DOMElement } from '../common/vnode';
import { __ERROR_BOUNDARY__ } from '../common/vnode';
import { Fragment } from '../jsx';
import { logger } from '../common/logger';
import {
  createRenderContext,
  withRenderContext,
  type RenderContext,
  type SSRData,
} from './context';
import {
  disposeSSRTemporaryOwners,
  executeComponentSync,
  renderSyncComponentRoot,
  type Component,
} from './component-runtime';
import {
  createErrorBoundaryReset,
  evaluateControlBoundaryChildren,
  getErrorBoundaryState,
  getRenderableChildren,
  normalizeRenderableChildren,
  resolveErrorBoundaryFallbackNode,
} from './boundaries';
import { renderAttrs, renderAttrsDirect } from './attrs';
import { VOID_ELEMENTS, escapeText } from './escape';
import { serializeHydrationRenderData } from './hydration-data';
import { startRenderPhase, stopRenderPhase } from './render-keys';
import type { RouteAppRenderInput } from './route-render';
import { StringSink } from './sink';
import type { VNode } from './types';

const __SSR_DEBUG =
  process.env.NODE_ENV !== 'production' &&
  (process.env.ASKR_SSR_DEBUG === '1' || process.env.ASKR_SSR_DEBUG === 'true');

export function inheritRenderableKey(
  source: VNode | JSXElement,
  result: VNode | JSXElement
): VNode | JSXElement {
  const inheritedKey = (source as DOMElement).key;
  if (inheritedKey === undefined || inheritedKey === null) {
    return result;
  }

  if (!result || typeof result !== 'object' || !('type' in result)) {
    return result;
  }

  const resultVNode = result as DOMElement;
  if (resultVNode.key === undefined || resultVNode.key === null) {
    resultVNode.key = inheritedKey;
  }

  if (typeof resultVNode.type === 'string') {
    if (!resultVNode.props) {
      resultVNode.props = {};
    }

    if (resultVNode.props['data-key'] === undefined) {
      resultVNode.props['data-key'] = String(inheritedKey);
    }
  }

  return result;
}

function renderRenderableSync(value: unknown, ctx: RenderContext): string {
  if (typeof value === 'string') return escapeText(value);
  if (typeof value === 'number') return escapeText(String(value));
  if (value === null || value === undefined || value === false) return '';
  if (Array.isArray(value)) return renderChildrenSync(value, ctx);
  if (value && typeof value === 'object' && 'type' in value) {
    return renderNodeSync(value as VNode, ctx);
  }
  return '';
}

function renderChildSync(child: unknown, ctx: RenderContext): string {
  return renderRenderableSync(child, ctx);
}

export function renderRenderableSyncToSink(
  value: unknown,
  sink: {
    write(html: string): void;
    write2?: (a: string, b: string) => void;
    write3?: (a: string, b: string, c: string) => void;
  },
  ctx: RenderContext
): void {
  if (value === null || value === undefined || value === false) return;
  if (typeof value === 'string') {
    sink.write(escapeText(value));
    return;
  }
  if (typeof value === 'number') {
    sink.write(escapeText(String(value)));
    return;
  }
  if (Array.isArray(value)) {
    renderChildrenSyncToSink(value, sink, ctx);
    return;
  }
  if (value && typeof value === 'object' && 'type' in value) {
    renderNodeSyncToSink(value as VNode, sink, ctx);
  }
}

function renderChildSyncToSink(
  child: unknown,
  sink: { write(html: string): void },
  ctx: RenderContext
): void {
  renderRenderableSyncToSink(child, sink, ctx);
}

function renderChildrenSync(
  children: unknown[] | undefined,
  ctx: RenderContext
): string {
  if (!children || !Array.isArray(children) || children.length === 0) return '';
  if (children.length === 1) return renderChildSync(children[0], ctx);

  if (children.length <= 8) {
    let result = '';
    for (const child of children) result += renderChildSync(child, ctx);
    return result;
  }

  const parts = Array.from({ length: children.length }, (_, index) =>
    renderChildSync(children[index], ctx)
  );
  return parts.join('');
}

function renderErrorBoundaryFallbackValue(
  fallback: unknown,
  error: unknown,
  reset: () => void,
  ctx: RenderContext
): string {
  const nextValue = resolveErrorBoundaryFallbackNode(fallback, error, reset);

  return Array.isArray(nextValue)
    ? renderChildrenSync(normalizeRenderableChildren(nextValue), ctx)
    : renderChildSync(nextValue, ctx);
}

function renderErrorBoundaryFallbackValueToSink(
  fallback: unknown,
  error: unknown,
  reset: () => void,
  sink: { write(html: string): void },
  ctx: RenderContext
): void {
  sink.write(renderErrorBoundaryFallbackValue(fallback, error, reset, ctx));
}

function renderChildrenSyncToSink(
  children: unknown[] | undefined,
  sink: { write(html: string): void },
  ctx: RenderContext
): void {
  if (!children || !Array.isArray(children) || children.length === 0) return;
  if (children.length >= 32) {
    for (let i = 0; i < children.length; i++) {
      renderRenderableSyncToSink(children[i], sink, ctx);
    }
    return;
  }
  for (let i = 0; i < children.length; i++) {
    renderChildSyncToSink(children[i], sink, ctx);
  }
}

function sinkWrite2(
  sink: { write(html: string): void; write2?: (a: string, b: string) => void },
  a: string,
  b: string
): void {
  if (typeof sink.write2 === 'function') {
    sink.write2(a, b);
    return;
  }
  sink.write(a);
  sink.write(b);
}

function sinkWrite3(
  sink: {
    write(html: string): void;
    write3?: (a: string, b: string, c: string) => void;
  },
  a: string,
  b: string,
  c: string
): void {
  if (typeof sink.write3 === 'function') {
    sink.write3(a, b, c);
    return;
  }
  sink.write(a);
  sink.write(b);
  sink.write(c);
}

function renderNodeSync(node: VNode | JSXElement, ctx: RenderContext): string {
  const { type, props } = node;

  /* istanbul ignore if - dev-only debug */
  if (__SSR_DEBUG) {
    try {
      logger.warn('[SSR] renderNodeSync type:', typeof type, type);
    } catch {}
  }

  if (typeof type === 'function') {
    const result = executeComponentSync(type as Component, props, ctx);
    return renderRenderableSync(inheritRenderableKey(node, result), ctx);
  }

  if (typeof type === 'symbol') {
    if (type === Fragment) {
      const childrenArr = getRenderableChildren(node);
      /* istanbul ignore if - dev-only debug */
      if (__SSR_DEBUG) {
        try {
          logger.warn('[SSR] fragment children length:', childrenArr?.length);
        } catch {
          // Ignore
        }
      }
      return renderChildrenSync(childrenArr, ctx);
    }
    if (type === __CONTROL_BOUNDARY__) {
      return renderChildrenSync(evaluateControlBoundaryChildren(node), ctx);
    }
    if (type === __ERROR_BOUNDARY__) {
      const boundaryState = getErrorBoundaryState(node);
      const fallback = props?.fallback;
      const reset = createErrorBoundaryReset(node);

      if (boundaryState?.error != null) {
        return renderErrorBoundaryFallbackValue(
          fallback,
          boundaryState.error,
          reset,
          ctx
        );
      }

      try {
        return renderChildrenSync(
          normalizeRenderableChildren(props?.children),
          ctx
        );
      } catch (error) {
        if (boundaryState) {
          boundaryState.error = error;
          boundaryState.notified = true;
        }
        logger.error('[Askr] ErrorBoundary caught render error:', error);
        return renderErrorBoundaryFallbackValue(fallback, error, reset, ctx);
      }
    }
    throw new Error(
      `renderNodeSync: unsupported VNode symbol type: ${String(type)}`
    );
  }

  const typeStr = type as string;
  if (VOID_ELEMENTS.has(typeStr)) {
    const attrs = renderAttrs(props);
    return `<${typeStr}${attrs} />`;
  }

  const maybeDangerous = (
    props as unknown as { dangerouslySetInnerHTML?: unknown }
  )?.dangerouslySetInnerHTML;
  if (maybeDangerous !== undefined && maybeDangerous !== null) {
    const { attrs, dangerousHtml } = renderAttrs(props, {
      returnDangerousHtml: true,
    });
    if (dangerousHtml !== undefined) {
      return `<${typeStr}${attrs}>${dangerousHtml}</${typeStr}>`;
    }
    const childrenHtml = renderChildrenSync(getRenderableChildren(node), ctx);
    return `<${typeStr}${attrs}>${childrenHtml}</${typeStr}>`;
  }

  const attrs = renderAttrs(props);
  const childrenHtml = renderChildrenSync(getRenderableChildren(node), ctx);
  return `<${typeStr}${attrs}>${childrenHtml}</${typeStr}>`;
}

function renderNodeSyncToSink(
  node: VNode | JSXElement,
  sink: {
    write(html: string): void;
    write2?: (a: string, b: string) => void;
    write3?: (a: string, b: string, c: string) => void;
  },
  ctx: RenderContext
): void {
  const { type, props } = node;

  if (typeof type === 'function') {
    const result = executeComponentSync(type as Component, props, ctx);
    renderRenderableSyncToSink(inheritRenderableKey(node, result), sink, ctx);
    return;
  }

  if (typeof type === 'symbol') {
    if (type === Fragment) {
      const childrenArr = getRenderableChildren(node);
      renderChildrenSyncToSink(childrenArr, sink, ctx);
      return;
    }
    if (type === __CONTROL_BOUNDARY__) {
      renderChildrenSyncToSink(
        evaluateControlBoundaryChildren(node),
        sink,
        ctx
      );
      return;
    }
    if (type === __ERROR_BOUNDARY__) {
      const boundaryState = getErrorBoundaryState(node);
      const fallback = props?.fallback;
      const reset = createErrorBoundaryReset(node);

      if (boundaryState?.error != null) {
        renderErrorBoundaryFallbackValueToSink(
          fallback,
          boundaryState.error,
          reset,
          sink,
          ctx
        );
        return;
      }

      try {
        renderChildrenSyncToSink(
          normalizeRenderableChildren(props?.children),
          sink,
          ctx
        );
      } catch (error) {
        if (boundaryState) {
          boundaryState.error = error;
          boundaryState.notified = true;
        }
        logger.error('[Askr] ErrorBoundary caught render error:', error);
        renderErrorBoundaryFallbackValueToSink(
          fallback,
          error,
          reset,
          sink,
          ctx
        );
      }
      return;
    }
    throw new Error(
      `renderNodeSyncToSink: unsupported VNode symbol type: ${String(type)}`
    );
  }

  const typeStr = type as string;
  if (VOID_ELEMENTS.has(typeStr)) {
    sinkWrite2(sink, '<', typeStr);
    renderAttrsDirect(props, sink);
    sink.write(' />');
    return;
  }

  const maybeDangerous = props
    ? (props as unknown as { dangerouslySetInnerHTML?: unknown })
        ?.dangerouslySetInnerHTML
    : undefined;

  if (maybeDangerous !== undefined && maybeDangerous !== null) {
    const dangerousHtml =
      typeof maybeDangerous === 'object' && '__html' in maybeDangerous
        ? String((maybeDangerous as { __html: unknown }).__html)
        : undefined;
    sinkWrite2(sink, '<', typeStr);
    renderAttrsDirect(props, sink);
    sink.write('>');
    if (dangerousHtml !== undefined) {
      sink.write(dangerousHtml);
    } else {
      renderChildrenSyncToSink(getRenderableChildren(node), sink, ctx);
    }
    sinkWrite3(sink, '</', typeStr, '>');
    return;
  }

  const children = getRenderableChildren(node);

  if (!children || (Array.isArray(children) && children.length === 0)) {
    sinkWrite2(sink, '<', typeStr);
    renderAttrsDirect(props, sink);
    sink.write('>');
    sinkWrite3(sink, '</', typeStr, '>');
    return;
  }

  if (Array.isArray(children) && children.length === 1) {
    const only = children[0];
    if (typeof only === 'string') {
      const content = escapeText(only);
      sinkWrite2(sink, '<', typeStr);
      renderAttrsDirect(props, sink);
      sink.write('>');
      sink.write(content);
      sinkWrite3(sink, '</', typeStr, '>');
      return;
    }
    if (typeof only === 'number') {
      const content = escapeText(String(only));
      sinkWrite2(sink, '<', typeStr);
      renderAttrsDirect(props, sink);
      sink.write('>');
      sink.write(content);
      sinkWrite3(sink, '</', typeStr, '>');
      return;
    }
  }

  sinkWrite2(sink, '<', typeStr);
  renderAttrsDirect(props, sink);
  sink.write('>');
  renderChildrenSyncToSink(children, sink, ctx);
  sinkWrite3(sink, '</', typeStr, '>');
}

export function renderToStringSync(
  component: (
    props?: Record<string, unknown>
  ) => VNode | JSXElement | string | number | boolean | null | undefined,
  props?: Record<string, unknown>,
  options?: { seed?: number; data?: SSRData }
): string {
  const seed = options?.seed ?? 12345;
  const ctx = createRenderContext(seed, { data: options?.data });

  return withRenderContext(ctx, () => {
    startRenderPhase(options?.data ?? null);
    try {
      const node = renderSyncComponentRoot(
        component as unknown as Component,
        props || {},
        ctx
      );
      if (!node) {
        throw new Error('renderToStringSync: wrapped component returned empty');
      }
      const sink = new StringSink();
      renderNodeSyncToSink(node, sink, ctx);
      sink.write(serializeHydrationRenderData(options?.data));
      sink.end();
      return sink.toString();
    } finally {
      try {
        stopRenderPhase();
      } finally {
        disposeSSRTemporaryOwners(ctx);
      }
    }
  });
}

export function renderSSRRouteAppToSink(input: RouteAppRenderInput): void {
  const { ctx, data, route, params, sink } = input;

  withRenderContext(ctx, () => {
    startRenderPhase(data || null);
    try {
      const app = executeComponentSync(
        route.handler as unknown as Component,
        params,
        ctx
      );
      renderRenderableSyncToSink(app, sink, ctx);
      sink.write(serializeHydrationRenderData(data));
    } finally {
      try {
        stopRenderPhase();
      } finally {
        disposeSSRTemporaryOwners(ctx);
      }
    }
  });
}
