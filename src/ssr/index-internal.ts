import type { JSXElement } from '../common/jsx';
import { getPublicAttributeName } from '../common/attr-names';
import { __CONTROL_BOUNDARY__ } from '../common/control';
import { SSR_RENDER_DATA_ATTR } from '../common/ssr';
import type { Props } from '../common/props';
import { Fragment, ELEMENT_TYPE } from '../jsx';
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
import type { ComponentInstance } from '../runtime/component';
import type { DOMElement } from '../common/vnode';
import { __ERROR_BOUNDARY__ } from '../common/vnode';
import { VOID_ELEMENTS, escapeText, styleObjToCss } from './escape';
import { renderAttrs, renderAttrsDirect } from './attrs';
import type { VNode } from './types';
import {
  renderRouteToStream,
  renderRouteToString,
  resolveRequest,
  type RouteAppRenderInput,
  type RouteRenderHost,
  type RouteRenderOptions,
  type RouteStreamOptions,
} from './route-render';
import { startRenderPhase, stopRenderPhase } from './render-keys';
import { StringSink } from './sink';

import { logger } from '../dev/logger';
import {
  type ControlBoundaryState,
  evaluateCaseState,
  evaluateShowState,
} from '../runtime/control';
import { evaluateForState } from '../runtime/for';

const __SSR_DEBUG =
  process.env.NODE_ENV !== 'production' &&
  (process.env.ASKR_SSR_DEBUG === '1' || process.env.ASKR_SSR_DEBUG === 'true');

function isSSRAttrEventHandler(key: string): boolean {
  return (
    key.length >= 3 &&
    key.charCodeAt(0) === 111 &&
    key.charCodeAt(1) === 110 &&
    key.charCodeAt(2) >= 65 &&
    key.charCodeAt(2) <= 90
  );
}

function inheritRenderableKey(
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

export { SSRDataMissingError } from './context';
export type {
  DocumentRenderArgs,
  DocumentRenderContext,
  DocumentRenderer,
} from '../common/ssr';
export type { SSRRoute } from './route-render';
export type { VNode, SSRComponent } from './types';
export { renderResolvedToStringSync } from './render-resolved';
export { resolveRequest };

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

function renderRenderableSyncToSink(
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

function serializeHydrationRenderData(data: SSRData | undefined): string {
  if (!data || Object.keys(data).length === 0) {
    return '';
  }

  return `<script type="application/json" ${SSR_RENDER_DATA_ATTR}="true">${JSON.stringify(
    data
  )
    .replace(/</g, '\\u003C')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')}</script>`;
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

function normalizeRenderableChildren(value: unknown): unknown[] {
  if (value === null || value === undefined || value === false) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function getErrorBoundaryState(
  node: VNode | JSXElement
): NonNullable<ComponentInstance['errorBoundaryState']> | null {
  return (
    (node as DOMElement & { __instance?: ComponentInstance }).__instance
      ?.errorBoundaryState ?? null
  );
}

function createDefaultErrorBoundaryFallbackVNode(error: unknown): JSXElement {
  const message =
    error instanceof Error
      ? error.stack || error.message || error.name
      : typeof error === 'string'
        ? error
        : (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return String(error);
            }
          })();

  return {
    $$typeof: ELEMENT_TYPE,
    type: 'div',
    props: {
      role: 'alert',
      'data-askr-error-boundary': 'true',
      style: {
        boxSizing: 'border-box',
        padding: '1rem',
        border: '1px solid currentColor',
        borderRadius: '0.75rem',
        display: 'grid',
        gap: '0.75rem',
        maxWidth: '100%',
      },
      children: [
        {
          $$typeof: ELEMENT_TYPE,
          type: 'strong',
          props: {
            children: ['Something went wrong while rendering this view.'],
          },
        },
        {
          $$typeof: ELEMENT_TYPE,
          type: 'p',
          props: {
            style: { margin: '0' },
            children: [
              'The app recovered into a visible fallback so the error is not hidden in the console.',
            ],
          },
        },
        {
          $$typeof: ELEMENT_TYPE,
          type: 'details',
          props: {
            open: process.env.NODE_ENV !== 'production',
            children: [
              {
                $$typeof: ELEMENT_TYPE,
                type: 'summary',
                props: {
                  children: ['Error details'],
                },
              },
              {
                $$typeof: ELEMENT_TYPE,
                type: 'pre',
                props: {
                  style: {
                    margin: '0',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  },
                  children: [message],
                },
              },
            ],
          },
        },
      ],
    },
    key: null,
  } as JSXElement;
}

function resolveErrorBoundaryFallbackNode(
  fallback: unknown,
  error: unknown,
  reset: () => void
): unknown {
  return typeof fallback === 'function'
    ? (fallback as (error: unknown, reset: () => void) => unknown)(error, reset)
    : fallback !== undefined
      ? fallback
      : createDefaultErrorBoundaryFallbackVNode(error);
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

function getControlBoundaryState(
  node: VNode | JSXElement
): ControlBoundaryState | null {
  const boundaryNode = node as DOMElement;

  return (
    boundaryNode._controlState ??
    (boundaryNode._forState as ControlBoundaryState | undefined) ??
    null
  );
}

function evaluateControlBoundaryChildren(
  node: VNode | JSXElement
): unknown[] | undefined {
  if (node.type !== __CONTROL_BOUNDARY__) {
    return undefined;
  }

  const controlState = getControlBoundaryState(node);
  if (!controlState) {
    return [];
  }

  if (controlState.kind === 'for') {
    return evaluateForState(controlState);
  }
  if (controlState.kind === 'show') {
    return evaluateShowState(controlState);
  }
  return evaluateCaseState(controlState);
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
    } catch {
    }
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
      const reset = () => {
        const instance = (
          node as DOMElement & { __instance?: ComponentInstance }
        ).__instance;
        const state = instance?.errorBoundaryState;
        if (state) {
          state.error = null;
          state.notified = false;
        }
      };

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
    // Unknown symbol type - throw a helpful error instead of letting
    // a built-in TypeError bubble up when attempting to coerce to string.
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
      const reset = () => {
        const instance = (
          node as DOMElement & { __instance?: ComponentInstance }
        ).__instance;
        const state = instance?.errorBoundaryState;
        if (state) {
          state.error = null;
          state.notified = false;
        }
      };

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

function getRenderableChildren(
  node: VNode | JSXElement
): unknown[] | undefined {
  if (Array.isArray((node as VNode).children)) {
    return (node as VNode).children;
  }
  if (Array.isArray(node.props?.children)) {
    return node.props.children as unknown[];
  }
  if (
    node.props?.children !== undefined &&
    node.props.children !== null &&
    node.props.children !== false
  ) {
    return [node.props.children];
  }
  return undefined;
}

type VerifyState = {
  current: ChildNode | null;
  pendingText: string;
};

function flushPendingText(state: VerifyState): boolean {
  if (state.pendingText.length === 0) {
    return true;
  }
  if (!state.current || state.current.nodeType !== Node.TEXT_NODE) {
    return false;
  }
  if (state.current.textContent !== state.pendingText) {
    return false;
  }
  state.current = state.current.nextSibling;
  state.pendingText = '';
  return true;
}

function verifyRenderedAttrs(
  element: Element,
  props: Props | undefined
): { matched: boolean; dangerousHtml?: string } {
  const matchedAttrs = new Set<string>();
  let dangerousHtml: string | undefined;

  if (!props || typeof props !== 'object') {
    return {
      matched: element.attributes.length === 0,
      dangerousHtml,
    };
  }

  const propsObj = props as Record<string, unknown>;
  for (const key in propsObj) {
    const value = propsObj[key];

    if (
      key === 'children' ||
      key === 'key' ||
      key === 'ref' ||
      key === 'dangerouslySetInnerHTML'
    ) {
      if (
        key === 'dangerouslySetInnerHTML' &&
        value &&
        typeof value === 'object' &&
        '__html' in value
      ) {
        dangerousHtml = String((value as { __html: unknown }).__html);
      }
      continue;
    }

    if (isSSRAttrEventHandler(key) || key.charCodeAt(0) === 95) {
      continue;
    }

    const attrName = key === 'class' ? 'class' : getPublicAttributeName(key);

    if (attrName === 'style') {
      const css = typeof value === 'string' ? value : styleObjToCss(value);
      if (!css) continue;
      if (element.getAttribute('style') !== css) {
        return { matched: false };
      }
      matchedAttrs.add('style');
      continue;
    }

    if (value === true) {
      if (!element.hasAttribute(attrName)) {
        return { matched: false };
      }
      matchedAttrs.add(attrName);
      continue;
    }

    if (value === false || value === null || value === undefined) {
      continue;
    }

    const stringValue = String(value);
    if (element.getAttribute(attrName) !== stringValue) {
      return { matched: false };
    }
    matchedAttrs.add(attrName);
  }

  if (element.attributes.length !== matchedAttrs.size) {
    return { matched: false };
  }

  return { matched: true, dangerousHtml };
}

function verifyExpectedNode(
  node: unknown,
  state: VerifyState,
  ctx: RenderContext
): boolean {
  if (node === null || node === undefined || node === false) {
    return true;
  }

  if (typeof node === 'string' || typeof node === 'number') {
    state.pendingText += String(node);
    return true;
  }

  if (Array.isArray(node)) {
    return verifyExpectedChildren(node, state, ctx);
  }

  if (!node || typeof node !== 'object' || !('type' in node)) {
    return true;
  }

  const vnode = node as VNode | JSXElement;
  const { type, props } = vnode;

  if (typeof type === 'function') {
    return verifyRenderableNode(
      inheritRenderableKey(
        vnode,
        executeComponentSync(type as Component, props, ctx)
      ),
      state,
      ctx
    );
  }

  if (typeof type === 'symbol') {
    if (type === __CONTROL_BOUNDARY__) {
      const children = evaluateControlBoundaryChildren(vnode);
      if (!children || children.length === 0) {
        return true;
      }
      for (let index = 0; index < children.length; index += 1) {
        if (!verifyExpectedNode(children[index], state, ctx)) {
          return false;
        }
      }
      return true;
    }
    if (type === __ERROR_BOUNDARY__) {
      const boundaryState = getErrorBoundaryState(vnode);
      const fallback = props?.fallback;
      const reset = () => {
        const instance = (
          vnode as DOMElement & { __instance?: ComponentInstance }
        ).__instance;
        const stateRef = instance?.errorBoundaryState;
        if (stateRef) {
          stateRef.error = null;
          stateRef.notified = false;
        }
      };

      const snapshot: VerifyState = {
        current: state.current,
        pendingText: state.pendingText,
      };

      if (boundaryState?.error != null) {
        const fallbackNode = resolveErrorBoundaryFallbackNode(
          fallback,
          boundaryState.error,
          reset
        );
        return verifyRenderableNode(fallbackNode, state, ctx);
      }

      try {
        if (
          verifyExpectedChildren(
            normalizeRenderableChildren(props?.children),
            state,
            ctx
          )
        ) {
          return true;
        }
      } catch (error) {
        if (boundaryState) {
          boundaryState.error = error;
          boundaryState.notified = true;
        }
      }

      state.current = snapshot.current;
      state.pendingText = snapshot.pendingText;

      const fallbackNode = resolveErrorBoundaryFallbackNode(
        fallback,
        boundaryState?.error ?? new Error('ErrorBoundary render failed'),
        reset
      );
      return verifyRenderableNode(fallbackNode, state, ctx);
    }
    if (type !== Fragment) {
      throw new Error(
        `verifyHydrationSyncForUrl: unsupported VNode symbol type: ${String(type)}`
      );
    }
    const children = getRenderableChildren(vnode);
    if (!children || children.length === 0) {
      return true;
    }
    for (let index = 0; index < children.length; index += 1) {
      if (!verifyExpectedNode(children[index], state, ctx)) {
        return false;
      }
    }
    return true;
  }

  if (!flushPendingText(state)) {
    return false;
  }

  if (!state.current || state.current.nodeType !== Node.ELEMENT_NODE) {
    return false;
  }

  const actualElement = state.current as Element;
  if (actualElement.tagName.toLowerCase() !== String(type).toLowerCase()) {
    return false;
  }

  const attrMatch = verifyRenderedAttrs(actualElement, props);
  if (!attrMatch.matched) {
    return false;
  }

  if (VOID_ELEMENTS.has(String(type))) {
    if (actualElement.firstChild !== null) {
      return false;
    }
    state.current = actualElement.nextSibling;
    return true;
  }

  if (attrMatch.dangerousHtml !== undefined) {
    if (actualElement.innerHTML !== attrMatch.dangerousHtml) {
      return false;
    }
    state.current = actualElement.nextSibling;
    return true;
  }

  const childState: VerifyState = {
    current: actualElement.firstChild,
    pendingText: '',
  };
  const children = getRenderableChildren(vnode);
  if (children && children.length > 0) {
    for (let index = 0; index < children.length; index += 1) {
      if (!verifyExpectedNode(children[index], childState, ctx)) {
        return false;
      }
    }
  }

  if (!flushPendingText(childState) || childState.current !== null) {
    return false;
  }

  state.current = actualElement.nextSibling;
  return true;
}

function verifyExpectedChildren(
  children: unknown[] | undefined,
  state: VerifyState,
  ctx: RenderContext
): boolean {
  if (!children || children.length === 0) {
    return true;
  }

  for (let index = 0; index < children.length; index += 1) {
    if (!verifyExpectedNode(children[index], state, ctx)) {
      return false;
    }
  }

  return true;
}

function verifyRenderableNode(
  value: unknown,
  state: VerifyState,
  ctx: RenderContext
): boolean {
  return Array.isArray(value)
    ? verifyExpectedChildren(normalizeRenderableChildren(value), state, ctx)
    : verifyExpectedNode(value, state, ctx);
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

function renderSSRRouteAppToSink(input: RouteAppRenderInput): void {
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

const routeRenderHost: RouteRenderHost = {
  renderAppToSink: renderSSRRouteAppToSink,
};

export function renderToString(
  component: (
    props?: Record<string, unknown>
  ) => VNode | JSXElement | string | number | null
): string;
export function renderToString(opts: RouteRenderOptions): string;
export function renderToString(arg: unknown): string {
  if (typeof arg === 'function') {
    return renderToStringSync(
      arg as (
        props?: Record<string, unknown>
      ) => VNode | JSXElement | string | number | null
    );
  }
  const opts = arg as RouteRenderOptions;
  return renderRouteToString(opts, routeRenderHost);
}

export function renderToStream(opts: RouteStreamOptions): void {
  renderRouteToStream(opts, routeRenderHost);
}
