import { getPublicAttributeName } from '../common/attr-names';
import { __CONTROL_BOUNDARY__ } from '../common/control';
import type { JSXElement } from '../common/jsx';
import type { Props } from '../common/props';
import { __ERROR_BOUNDARY__ } from '../common/vnode';
import { Fragment } from '../jsx';
import {
  createErrorBoundaryReset,
  evaluateControlBoundaryChildren,
  getErrorBoundaryState,
  getRenderableChildren,
  normalizeRenderableChildren,
  resolveErrorBoundaryFallbackNode,
} from './boundaries';
import { executeComponentSync, type Component } from './component-runtime';
import type { RenderContext } from './context';
import { VOID_ELEMENTS, styleObjToCss } from './escape';
import { inheritRenderableKey } from './render-sync';
import type { VNode } from './types';

type VerifyState = {
  current: ChildNode | null;
  pendingText: string;
};

function isSSRAttrEventHandler(key: string): boolean {
  return (
    key.length >= 3 &&
    key.charCodeAt(0) === 111 &&
    key.charCodeAt(1) === 110 &&
    key.charCodeAt(2) >= 65 &&
    key.charCodeAt(2) <= 90
  );
}

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
      const reset = createErrorBoundaryReset(vnode);

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

export const hydrationVerifier = {
  verifyRenderableNode,
};
