import type { Props } from '../common/props';
import type { RenderSink } from './sink';
import type { VNode, SSRComponent } from './types';
import type { DOMElement } from '../common/vnode';
import { __CONTROL_BOUNDARY__ } from '../common/control';
import { Fragment } from '../jsx';
import { type RenderContext, throwSSRDataMissing } from './context';
import { VOID_ELEMENTS, escapeText } from './escape';
import { renderAttrsDirect } from './attrs';
import {
  commitForStateTransaction,
  evaluateCaseState,
  evaluateForState,
  evaluateShowState,
  rollbackForStateTransaction,
  type ControlBoundaryState,
} from '../runtime';

const RANGE_START = '<!--askr-range-start-->';
const RANGE_END = '<!--askr-range-end-->';

// Re-export for backwards compatibility
export type Component = SSRComponent;

// Legacy alias for context type
export type SSRContext = RenderContext;

function isPromiseLike(x: unknown): x is PromiseLike<unknown> {
  if (!x || typeof x !== 'object') return false;
  return typeof (x as { then?: unknown }).then === 'function';
}

function executeComponent(
  type: Component,
  props: Props | undefined,
  ctx: RenderContext
): unknown {
  const res = type(props ?? {}, { signal: ctx.signal });
  if (isPromiseLike(res)) {
    throwSSRDataMissing();
  }
  return res;
}

function inheritRenderableKey(source: VNode, result: unknown): unknown {
  const inheritedKey = source.key;
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
    if (resultVNode.props['data-askr-key-kind'] === undefined) {
      resultVNode.props['data-askr-key-kind'] = typeof inheritedKey;
    }
  }

  return result;
}

// Render children directly without allocating wrapper array when possible
function renderChildrenDirect(
  node: unknown,
  sink: RenderSink,
  ctx: RenderContext
): void {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      renderNodeToSink(node[i], sink, ctx);
    }
    return;
  }

  const childNode = node as
    | { children?: unknown; props?: { children?: unknown } }
    | null
    | undefined;

  // Prefer explicit children; fallback to props.children
  let raw: unknown = childNode?.children;
  if (raw === undefined) {
    raw = childNode?.props?.children;
  }

  if (raw === null || raw === undefined || raw === false) return;

  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      renderNodeToSink(raw[i], sink, ctx);
    }
    return;
  }

  // Single child - no array allocation
  renderNodeToSink(raw, sink, ctx);
}

function getControlBoundaryState(
  node: DOMElement
): ControlBoundaryState | null {
  return node._controlState ?? node._forState ?? null;
}

function renderControlBoundaryChildren(
  node: VNode,
  sink: RenderSink,
  ctx: RenderContext
): void {
  const controlState = getControlBoundaryState(node as unknown as DOMElement);
  if (!controlState) {
    return;
  }

  if (controlState.kind === 'for') {
    const children = evaluateForState(controlState);
    try {
      for (const child of children) {
        const shouldMark =
          typeof child === 'object' &&
          child !== null &&
          'type' in child &&
          child.type === Fragment &&
          ((child.props?.children as unknown[] | undefined)?.length ?? 0) !== 1;
        if (shouldMark) sink.write(RANGE_START);
        renderNodeToSink(child, sink, ctx);
        if (shouldMark) sink.write(RANGE_END);
      }
      commitForStateTransaction(controlState);
    } catch (error) {
      rollbackForStateTransaction(controlState);
      throw error;
    }
    return;
  }

  if (controlState.kind === 'show') {
    const children = evaluateShowState(controlState);
    const shouldMark =
      children.length !== 1 ||
      (typeof children[0] === 'object' &&
        children[0] !== null &&
        'type' in children[0] &&
        children[0].type === Fragment &&
        ((children[0].props?.children as unknown[] | undefined)?.length ?? 0) !== 1);
    if (shouldMark) sink.write(RANGE_START);
    renderChildrenDirect(children, sink, ctx);
    if (shouldMark) sink.write(RANGE_END);
    return;
  }

  const children = evaluateCaseState(controlState);
  const shouldMark =
    children.length !== 1 ||
    (typeof children[0] === 'object' &&
      children[0] !== null &&
      'type' in children[0] &&
      children[0].type === Fragment &&
      ((children[0].props?.children as unknown[] | undefined)?.length ?? 0) !== 1);
  if (shouldMark) sink.write(RANGE_START);
  renderChildrenDirect(children, sink, ctx);
  if (shouldMark) sink.write(RANGE_END);
}

export function renderNodeToSink(
  node: unknown,
  sink: RenderSink,
  ctx: RenderContext
): void {
  if (node === null || node === undefined) return;

  // Fast path: primitive strings
  if (typeof node === 'string') {
    sink.write(escapeText(node));
    return;
  }

  // Fast path: numbers
  if (typeof node === 'number') {
    sink.write(String(node));
    return;
  }

  // Skip booleans (false is common from conditional rendering)
  if (typeof node === 'boolean') return;

  // Must be object at this point
  if (typeof node !== 'object') return;

  const vnode = node as VNode;
  const type = vnode.type;

  // Fragment: render children directly (canonical check via === is fastest)
  if (type === Fragment) {
    renderChildrenDirect(
      vnode as unknown as Record<string, unknown>,
      sink,
      ctx
    );
    return;
  }

  // Symbol type that isn't our Fragment
  if (typeof type === 'symbol') {
    // Unknown symbol - render children as fragment fallback
    if (type === __CONTROL_BOUNDARY__) {
      renderControlBoundaryChildren(vnode, sink, ctx);
      return;
    }
    renderChildrenDirect(
      vnode as unknown as Record<string, unknown>,
      sink,
      ctx
    );
    return;
  }

  // Function component
  if (typeof type === 'function') {
    const out = executeComponent(type as Component, vnode.props, ctx);
    renderNodeToSink(inheritRenderableKey(vnode, out), sink, ctx);
    return;
  }

  // Element node (type is string)
  const tag = type as string;
  const props = vnode.props;

  // Check for dangerouslySetInnerHTML
  const dangerous = props?.dangerouslySetInnerHTML as
    | { __html: unknown }
    | undefined;
  const dangerousHtml =
    dangerous && typeof dangerous === 'object' && '__html' in dangerous
      ? String(dangerous.__html)
      : undefined;

  // Void element - self-closing
  if (VOID_ELEMENTS.has(tag)) {
    sink.write('<');
    sink.write(tag);
    renderAttrsDirect(props, sink);
    sink.write(' />');
    return;
  }

  // Regular element
  sink.write('<');
  sink.write(tag);
  renderAttrsDirect(props, sink);
  sink.write('>');

  if (dangerousHtml !== undefined) {
    sink.write(dangerousHtml);
  } else {
    renderChildrenDirect(
      vnode as unknown as Record<string, unknown>,
      sink,
      ctx
    );
  }

  sink.write('</');
  sink.write(tag);
  sink.write('>');
}
