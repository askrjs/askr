import { isFragmentType, type JSXElement } from '../common/jsx';
import { __CONTROL_BOUNDARY__ } from '../common/control';
import type { DOMElement } from '../common/vnode';
import { __ERROR_BOUNDARY__ } from '../common/vnode';
import { logger } from '../common/logger';
import {
  getVNodeContextFrame,
  readFunctionChildValue,
  readUntracked,
} from '../runtime';
import { SSR_PORTAL_ANCHOR, SSR_PORTAL_HOST } from '../common/portal';
import {
  createRenderContext,
  withRenderContext,
  type RenderContext,
  type RenderRouteState,
  type SSRData,
} from './context';
import {
  disposeSSRTemporaryOwners,
  executeComponentSync,
  renderSyncComponentRoot,
  wrapWithDefaultPortal,
  type Component,
} from './component-runtime';
import {
  createErrorBoundaryReset,
  getErrorBoundaryState,
  getControlBoundaryState,
  getRenderableChildren,
  normalizeRenderableChildren,
  resolveErrorBoundaryFallbackNode,
  withControlBoundaryChildren,
} from './boundaries';
import { renderAttrsDirect, resolveReactiveAttributeProps } from './attrs';
import {
  VOID_ELEMENTS,
  escapeRawText,
  escapeText,
  type RawTextElement,
} from './escape';
import {
  getChildNamespace,
  getElementNamespace,
  getRawTextElementInContext,
  type SSRNamespace,
} from './namespace';
import { serializeHydrationRenderData } from './hydration-data';
import { startRenderPhase, stopRenderPhase } from './render-keys';
import type { RouteAppRenderInput } from './route-render';
import { StringSink } from './sink';
import type { VNode } from './types';
import { DEFERRED_BOUNDARY } from '../common/deferred-value';
import { CspNonceScope, validateCspNonce } from '../csp-nonce';

const __SSR_DEBUG =
  process.env.NODE_ENV !== 'production' &&
  (process.env.ASKR_SSR_DEBUG === '1' || process.env.ASKR_SSR_DEBUG === 'true');

const RANGE_START = '<!--askr-range-start-->';
const RANGE_END = '<!--askr-range-end-->';

function isMultiRangeChild(child: unknown): boolean {
  if (Array.isArray(child)) return true;
  if (!child || typeof child !== 'object' || !('type' in child)) {
    return false;
  }
  const vnode = child as VNode;
  return isFragmentType(vnode.type);
}

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
    if (resultVNode.props['data-askr-key-kind'] === undefined) {
      resultVNode.props['data-askr-key-kind'] = typeof inheritedKey;
    }
  }

  return result;
}

/**
 * Render a value to a string through the streaming renderer.
 *
 * Portal resolution splices content into the finished document by token, so it
 * genuinely needs a string — but it gets one from the same renderer everything
 * else uses rather than from a second implementation.
 */
function renderRenderableToString(
  value: unknown,
  ctx: RenderContext,
  namespace: SSRNamespace
): string {
  const sink = new StringSink();
  withNamespace(namespace, () => renderRenderableSyncToSink(value, sink, ctx));
  sink.end();
  return sink.toString();
}

function resolveSSRPortals(html: string, ctx: RenderContext): string {
  let resolved = html;
  const renderedHosts = new Set<string>();

  for (;;) {
    let foundHost = false;

    for (const slot of ctx.ssrPortals.slots.values()) {
      const explicitHosts = slot.hosts.filter((host) => !host.automatic);
      const activeHosts =
        explicitHosts.length > 0
          ? new Set(explicitHosts.map((host) => host.token))
          : new Set(slot.hosts.map((host) => host.token));

      for (const host of slot.hosts) {
        if (renderedHosts.has(host.token)) {
          continue;
        }

        foundHost = true;
        const content =
          activeHosts.has(host.token) && slot.hasValue
            ? renderRenderableToString(
                slot.value,
                ctx,
                portalHostNamespaces.get(ctx)?.get(host.token) ?? 'html'
              )
            : '';
        resolved = resolved.replace(host.token, () =>
          host.automatic &&
          content === '' &&
          slot.hasValue &&
          explicitHosts.length === 0
            ? host.token
            : content
        );
        renderedHosts.add(host.token);
      }
    }

    if (!foundHost) {
      return resolved;
    }
  }
}

class SSRPortalSink {
  private bufferedChunks: string[] | null = null;

  constructor(
    private readonly sink: {
      write(html: string): void;
    }
  ) {}

  write(html: string): void {
    if (!html) {
      return;
    }
    if (this.bufferedChunks) {
      this.bufferedChunks.push(html);
      return;
    }
    this.sink.write(html);
  }

  writePortalHost(token: string): void {
    this.bufferedChunks ??= [];
    this.bufferedChunks.push(token);
  }

  flush(ctx: RenderContext): void {
    if (!this.bufferedChunks) {
      return;
    }
    this.sink.write(resolveSSRPortals(this.bufferedChunks.join(''), ctx));
  }
}

/** The streaming target: `write` plus the optional batched and portal writes. */
type SinkTarget = {
  write(html: string): void;
  write2?: (a: string, b: string) => void;
  write3?: (a: string, b: string, c: string) => void;
  writePortalHost?: (token: string) => void;
};

/**
 * Collects writes so they can be published to a real sink, or dropped.
 *
 * An ErrorBoundary is transactional: markup its subtree produced before a
 * descendant threw must never reach the response, or the fallback lands inside
 * a half-written element. A sink cannot take output back, so the protected
 * subtree renders into one of these first.
 *
 * Portal host writes are recorded rather than flattened, because reaching the
 * real sink through `writePortalHost` is what puts it into portal-resolving
 * mode; replaying them preserves both that signal and the original order.
 */
class BufferedSink {
  private readonly operations: Array<{ portalHost: boolean; text: string }> =
    [];

  write(html: string): void {
    if (html) this.operations.push({ portalHost: false, text: html });
  }

  writePortalHost(token: string): void {
    this.operations.push({ portalHost: true, text: token });
  }

  publishTo(sink: SinkTarget): void {
    for (const operation of this.operations) {
      if (operation.portalHost && sink.writePortalHost) {
        sink.writePortalHost(operation.text);
      } else {
        sink.write(operation.text);
      }
    }
  }
}

export function renderRenderableSyncToSink(
  value: unknown,
  sink: SinkTarget,
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
  if (typeof value === 'function') {
    // A function or readable child is reactive on the client; the server
    // renders its current value once, without subscribing to it.
    renderFunctionChildResultToSink(
      readUntracked(() => readFunctionChildValue(value as () => unknown)),
      sink,
      ctx
    );
    return;
  }
  if (value && typeof value === 'object' && 'type' in value) {
    renderNodeSyncToSink(value as VNode, sink, ctx);
  }
}

/**
 * The top-level items of a function child's result: array entries and
 * fragment children, flattened. As on the client, a function among them
 * (after one readable has been read) renders nothing, while elements keep
 * their own reactive children.
 */
function getFunctionChildResultItems(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (
    value &&
    typeof value === 'object' &&
    'type' in value &&
    isFragmentType((value as VNode).type)
  ) {
    return getRenderableChildren(value as VNode) ?? [];
  }
  return null;
}

/** Write what a function child produced (see `getFunctionChildResultItems`). */
function renderFunctionChildResultToSink(
  value: unknown,
  sink: SinkTarget,
  ctx: RenderContext
): void {
  if (typeof value === 'function') return;
  const items = getFunctionChildResultItems(value);
  if (items) {
    for (let i = 0; i < items.length; i++) {
      renderFunctionChildResultToSink(items[i], sink, ctx);
    }
    return;
  }
  renderRenderableSyncToSink(value, sink, ctx);
}

function renderChildSyncToSink(
  child: unknown,
  sink: SinkTarget,
  ctx: RenderContext
): void {
  renderRenderableSyncToSink(child, sink, ctx);
}

/**
 * Write a deferred boundary's pending content inside its resolve wrapper.
 *
 * The wrapper is known from the node's props, so the children stream into the
 * sink between the two markers rather than being rendered to a string first.
 */
function renderDeferredBoundaryToSink(
  node: VNode | JSXElement,
  sink: SinkTarget,
  ctx: RenderContext
): void {
  const id = String(node.props?.['id'] ?? '');
  sink.write(`<askr-resolve data-askr-deferred="${id}">`);
  renderRenderableSyncToSink(node.props?.['pending'], sink, ctx);
  sink.write('</askr-resolve>');
}

/** Write one `For` row, bracketing it with range markers when it spans several nodes. */
function renderForRangeChildToSink(
  child: unknown,
  sink: SinkTarget,
  ctx: RenderContext
): void {
  if (
    child &&
    typeof child === 'object' &&
    'type' in child &&
    typeof (child as VNode).type === 'function'
  ) {
    const vnode = child as VNode | JSXElement;
    const result = executeComponentSync(
      vnode.type as Component,
      vnode.props,
      ctx,
      getVNodeContextFrame(vnode) ?? null
    );
    renderForRangeChildToSink(inheritRenderableKey(vnode, result), sink, ctx);
    return;
  }

  const spansRange = isMultiRangeChild(child);
  if (spansRange) sink.write(RANGE_START);
  renderChildSyncToSink(child, sink, ctx);
  if (spansRange) sink.write(RANGE_END);
}

/**
 * Write a control boundary's children.
 *
 * Whether the boundary needs range markers is decided from the children
 * themselves, before any of them render, so the decision costs nothing and the
 * subtree can stream out as it is produced.
 */
function renderControlChildrenToSink(
  node: VNode | JSXElement,
  sink: SinkTarget,
  ctx: RenderContext
): void {
  const controlState = getControlBoundaryState(node);

  withControlBoundaryChildren<void>(node, (children) => {
    const values = children ?? [];

    if (controlState?.kind === 'for') {
      for (let index = 0; index < values.length; index += 1) {
        renderForRangeChildToSink(values[index], sink, ctx);
      }
      return;
    }

    const spansRange = values.length !== 1 || isMultiRangeChild(values[0]);
    if (spansRange) sink.write(RANGE_START);
    renderChildrenSyncToSink(values, sink, ctx);
    if (spansRange) sink.write(RANGE_END);
  });
}

function renderErrorBoundaryFallbackValueToSink(
  fallback: unknown,
  error: unknown,
  reset: () => void,
  sink: SinkTarget,
  ctx: RenderContext
): void {
  const nextValue = resolveErrorBoundaryFallbackNode(fallback, error, reset);

  if (Array.isArray(nextValue)) {
    renderChildrenSyncToSink(normalizeRenderableChildren(nextValue), sink, ctx);
    return;
  }
  renderChildSyncToSink(nextValue, sink, ctx);
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

/**
 * Gather the text content of an HTML raw text element (`<script>`, `<style>`).
 *
 * The parser does not decode entities there, so the text is collected
 * unescaped and neutralized as a whole by `escapeRawText`. Text may come from
 * strings, numbers, fragments, components, control and error boundaries, and
 * function or readable children, which contribute their current value.
 * Range markers are omitted because a comment has no raw text form. Element
 * children are rejected rather than serialized as markup the parser would
 * read back as literal text.
 */
function collectRawText(
  value: unknown,
  element: RawTextElement,
  ctx: RenderContext
): string {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return '';
  }
  if (typeof value === 'function') {
    return collectFunctionChildRawText(
      readUntracked(() => readFunctionChildValue(value as () => unknown)),
      element,
      ctx
    );
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    let text = '';
    for (let i = 0; i < value.length; i++) {
      text += collectRawText(value[i], element, ctx);
    }
    return text;
  }
  if (typeof value === 'object' && 'type' in value) {
    const node = value as VNode | JSXElement;
    const { type, props } = node;
    if (typeof type === 'function') {
      return collectRawText(
        executeComponentSync(
          type as Component,
          props,
          ctx,
          getVNodeContextFrame(node) ?? null
        ),
        element,
        ctx
      );
    }
    if (type === __CONTROL_BOUNDARY__) {
      return withControlBoundaryChildren(node, (children) =>
        collectRawText(children, element, ctx)
      );
    }
    if (type === __ERROR_BOUNDARY__) {
      return collectErrorBoundaryRawText(node, element, ctx);
    }
    if (isFragmentType(type)) {
      return collectRawText(getRenderableChildren(node), element, ctx);
    }
  }
  throw new Error(
    `SSR: <${element}> children must be text, but received ${describeRawTextChild(value)}.`
  );
}

/** Raw text of a function child's result (see `getFunctionChildResultItems`). */
function collectFunctionChildRawText(
  value: unknown,
  element: RawTextElement,
  ctx: RenderContext
): string {
  if (typeof value === 'function') return '';
  const items = getFunctionChildResultItems(value);
  if (items) {
    let text = '';
    for (let i = 0; i < items.length; i++) {
      text += collectFunctionChildRawText(items[i], element, ctx);
    }
    return text;
  }
  return collectRawText(value, element, ctx);
}

function collectErrorBoundaryRawText(
  node: VNode | JSXElement,
  element: RawTextElement,
  ctx: RenderContext
): string {
  const boundaryState = getErrorBoundaryState(node);
  const fallback = node.props?.fallback;
  const reset = createErrorBoundaryReset(node);
  if (boundaryState?.error != null) {
    return collectRawText(
      resolveErrorBoundaryFallbackNode(fallback, boundaryState.error, reset),
      element,
      ctx
    );
  }
  try {
    return collectRawText(node.props?.children, element, ctx);
  } catch (error) {
    if (boundaryState) {
      boundaryState.error = error;
      boundaryState.notified = true;
    }
    logger.error('[Askr] ErrorBoundary caught render error:', error);
    return collectRawText(
      resolveErrorBoundaryFallbackNode(fallback, error, reset),
      element,
      ctx
    );
  }
}

function describeRawTextChild(value: unknown): string {
  if (value && typeof value === 'object' && 'type' in value) {
    const type = (value as VNode).type;
    return typeof type === 'string'
      ? `an element <${type}>`
      : 'a non-text node';
  }
  return `a value of type ${typeof value}`;
}

/**
 * The parser context of the element being written (see `./namespace`).
 *
 * SSR renders synchronously, so one module-level cursor suffices: every
 * element saves and restores it around its children, and each top-level render
 * starts from `html`.
 */
let currentNamespace: SSRNamespace = 'html';

/** Namespace context recorded where each portal host token was written. */
const portalHostNamespaces = new WeakMap<
  RenderContext,
  Map<string, SSRNamespace>
>();

function withNamespace<T>(namespace: SSRNamespace, render: () => T): T {
  const previous = currentNamespace;
  currentNamespace = namespace;
  try {
    return render();
  } finally {
    currentNamespace = previous;
  }
}

function renderNodeSyncToSink(
  node: VNode | JSXElement,
  sink: SinkTarget,
  ctx: RenderContext
): void {
  const { type, props } = node;

  if (typeof type === 'function') {
    const result = executeComponentSync(
      type as Component,
      props,
      ctx,
      getVNodeContextFrame(node) ?? null
    );
    renderRenderableSyncToSink(inheritRenderableKey(node, result), sink, ctx);
    return;
  }

  if (typeof type === 'symbol') {
    if (type === SSR_PORTAL_HOST) {
      const token = String(props?.token ?? '');
      let hostNamespaces = portalHostNamespaces.get(ctx);
      if (!hostNamespaces) {
        hostNamespaces = new Map();
        portalHostNamespaces.set(ctx, hostNamespaces);
      }
      hostNamespaces.set(token, currentNamespace);
      const portalSink = sink as typeof sink & {
        writePortalHost?(token: string): void;
      };
      if (portalSink.writePortalHost) {
        portalSink.writePortalHost(token);
      } else {
        sink.write(token);
      }
      return;
    }
    if (type === SSR_PORTAL_ANCHOR) {
      sink.write(String(props?.token ?? ''));
      return;
    }
    if (isFragmentType(type)) {
      const childrenArr = getRenderableChildren(node);
      renderChildrenSyncToSink(childrenArr, sink, ctx);
      return;
    }
    if (type === __CONTROL_BOUNDARY__) {
      renderControlChildrenToSink(node, sink, ctx);
      return;
    }
    if (type === DEFERRED_BOUNDARY) {
      renderDeferredBoundaryToSink(node, sink, ctx);
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

      // Buffered so a failure part-way through discards everything the
      // subtree already produced instead of appending the fallback to it.
      const protectedOutput = new BufferedSink();
      try {
        renderChildrenSyncToSink(
          normalizeRenderableChildren(props?.children),
          protectedOutput,
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
        return;
      }

      // Publishing sits outside the guard: only a failure *while rendering* is
      // recoverable, and replaying a completed subtree must not be able to
      // append a fallback to markup it has already handed over.
      protectedOutput.publishTo(sink);
      return;
    }
    throw new Error(
      `renderNodeSyncToSink: unsupported VNode symbol type: ${String(type)}`
    );
  }

  const typeStr = type as string;
  assertElementName(typeStr);
  if (VOID_ELEMENTS.has(typeStr)) {
    sinkWrite2(sink, '<', typeStr);
    renderAttrsDirect(props, sink, typeStr);
    sink.write(' />');
    return;
  }

  const parentNamespace = currentNamespace;
  const tag = typeStr.toLowerCase();
  const namespace = getElementNamespace(parentNamespace, tag);
  // `annotation-xml` reads its `encoding` to choose its children's context
  // and then writes it, so a reactive value is read once for both.
  const element =
    tag === 'annotation-xml' ? resolveReactiveAttributeNode(node) : node;
  currentNamespace = getChildNamespace(
    parentNamespace,
    namespace,
    tag,
    element.props
  );
  try {
    renderElementSyncToSink(
      element,
      typeStr,
      getRawTextElementInContext(parentNamespace, namespace, tag),
      sink,
      ctx
    );
  } finally {
    currentNamespace = parentNamespace;
  }
}

function resolveReactiveAttributeNode(
  node: VNode | JSXElement
): VNode | JSXElement {
  const props = resolveReactiveAttributeProps(node.props);
  return props === node.props ? node : ({ ...node, props } as typeof node);
}

/**
 * Write a non-void intrinsic element. `rawTextElement` is set only for an
 * HTML `<script>` / `<style>` whose ancestors are all ordinary HTML content
 * (a `<style>` inside `<select>` is not parsed as one).
 * The same tags in SVG or MathML are ordinary elements whose text the parser
 * reads as markup, and inside a raw text or RCDATA ancestor (`noscript`,
 * `textarea`, ...) raw content could close that ancestor, so both keep
 * escaped text.
 */
function renderElementSyncToSink(
  node: VNode | JSXElement,
  typeStr: string,
  rawTextElement: RawTextElement | null,
  sink: SinkTarget,
  ctx: RenderContext
): void {
  const { props } = node;

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
    renderAttrsDirect(props, sink, typeStr);
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

  if (rawTextElement !== null) {
    const text = collectRawText(children, rawTextElement, ctx);
    sinkWrite2(sink, '<', typeStr);
    renderAttrsDirect(props, sink);
    sink.write('>');
    sink.write(escapeRawText(text, rawTextElement));
    sinkWrite3(sink, '</', typeStr, '>');
    return;
  }

  if (!children || (Array.isArray(children) && children.length === 0)) {
    sinkWrite2(sink, '<', typeStr);
    renderAttrsDirect(props, sink, typeStr);
    sink.write('>');
    sinkWrite3(sink, '</', typeStr, '>');
    return;
  }

  if (Array.isArray(children) && children.length === 1) {
    const only = children[0];
    if (typeof only === 'string') {
      const content = escapeText(only);
      sinkWrite2(sink, '<', typeStr);
      renderAttrsDirect(props, sink, typeStr);
      sink.write('>');
      sink.write(content);
      sinkWrite3(sink, '</', typeStr, '>');
      return;
    }
    if (typeof only === 'number') {
      const content = escapeText(String(only));
      sinkWrite2(sink, '<', typeStr);
      renderAttrsDirect(props, sink, typeStr);
      sink.write('>');
      sink.write(content);
      sinkWrite3(sink, '</', typeStr, '>');
      return;
    }
  }

  sinkWrite2(sink, '<', typeStr);
  renderAttrsDirect(props, sink, typeStr);
  sink.write('>');
  renderChildrenSyncToSink(children, sink, ctx);
  sinkWrite3(sink, '</', typeStr, '>');
}

/** Synchronously render a component to an HTML string, without route resolution. */
export function renderToStringSync(
  component: (
    props?: Record<string, unknown>
  ) => VNode | JSXElement | string | number | boolean | null | undefined,
  props?: Record<string, unknown>,
  options?: {
    seed?: number;
    data?: SSRData;
    /** @internal A composed page render envelope. */
    envelope?: import('../common/page-render-envelope').PageRenderEnvelope;
    cspNonce?: string;
    /** @internal Request-local authentication for deferred SSR passes. */
    authContext?: import('@askrjs/auth').AuthContext;
    /** @internal Request-local route state for deferred SSR passes. */
    route?: RenderRouteState;
    /** @internal Capture request-local registrations produced by this pass. */
    onContext?: (ctx: RenderContext) => void;
  }
): string {
  const seed = options?.seed ?? 12345;
  const nonce = validateCspNonce(options?.cspNonce);
  const ctx = createRenderContext(seed, {
    data: options?.data,
    envelope: options?.envelope,
    cspNonce: nonce,
    authContext: options?.authContext,
    ...options?.route,
  });

  return withRenderContext(ctx, () => {
    startRenderPhase(ctx.renderData);
    try {
      const renderComponent =
        nonce === undefined
          ? component
          : () =>
              CspNonceScope({
                value: nonce,
                children: () => component(props) as never,
              });
      const node = renderSyncComponentRoot(
        renderComponent as unknown as Component,
        props || {},
        ctx
      );
      if (!node) {
        throw new Error('renderToStringSync: wrapped component returned empty');
      }
      const sink = new StringSink();
      withNamespace('html', () => renderNodeSyncToSink(node, sink, ctx));
      sink.end();
      const html = resolveSSRPortals(sink.toString(), ctx);
      options?.onContext?.(ctx);
      return (
        html +
        serializeHydrationRenderData(
          ctx.hydrationData ?? undefined,
          ctx.dataRuntime as import('../data/types').DataRuntime | undefined
        )
      );
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
    startRenderPhase(ctx.renderData);
    try {
      const renderHandler =
        ctx.cspNonce === undefined
          ? route.handler
          : () =>
              CspNonceScope({
                value: ctx.cspNonce,
                children: () => route.handler(params),
              });
      const app = executeComponentSync(
        renderHandler as unknown as Component,
        params,
        ctx
      );
      const appSink = new SSRPortalSink(sink);
      withNamespace('html', () =>
        renderRenderableSyncToSink(wrapWithDefaultPortal(app), appSink, ctx)
      );
      appSink.flush(ctx);
      if (ctx.deferredBoundaries.length === 0) {
        sink.write(
          serializeHydrationRenderData(
            ctx.hydrationData ?? data,
            ctx.dataRuntime as import('../data/types').DataRuntime | undefined
          )
        );
      }
    } finally {
      try {
        stopRenderPhase();
      } finally {
        disposeSSRTemporaryOwners(ctx);
      }
    }
  });
}
function assertElementName(name: string): void {
  if (!/^[A-Za-z][A-Za-z0-9._:-]*$/.test(name)) {
    throw new TypeError(`Invalid SSR element name: ${JSON.stringify(name)}`);
  }
}
