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
  evaluateCaseState,
  evaluateShowState,
  type ControlBoundaryState,
} from '../runtime/control';
import { evaluateForState } from '../runtime/for';

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
    renderChildrenDirect(evaluateForState(controlState), sink, ctx);
    return;
  }

  if (controlState.kind === 'show') {
    renderChildrenDirect(evaluateShowState(controlState), sink, ctx);
    return;
  }

  renderChildrenDirect(evaluateCaseState(controlState), sink, ctx);
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
