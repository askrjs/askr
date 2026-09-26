/**
 * Synchronous server rendering.
 *
 * Components run on the same execution path as in the browser (a component
 * instance per element, positional hooks, scopes through the owner tree) and
 * their output is interpreted with the same child descriptors as the DOM
 * renderer. The server reads function children and props once, never
 * subscribes, and ends every lifetime when the render finishes.
 *
 * The output is plain HTML: no marker comments or framework attributes.
 * Portal hosts write tokens that are replaced with their final content once
 * the render root completes.
 */

import type { AuthContext } from '@askrjs/auth';
import { DEFERRED_BOUNDARY } from '../common/deferred-value';
import type { JSXElement } from '../common/jsx';
import { SSR_PORTAL_HOST } from '../common/portal';
import { isPromiseLike } from '../common/promise';
import type { Props } from '../common/props';
import type { ComponentFunction } from '../common/component';
import { ComponentInstance } from '../core/component/instance';
import { untrack } from '../core/reactive/graph';
import { Owner, runWithOwner } from '../core/reactive/owner';
import { readValue } from '../core/reactive/readable';
import {
  COMPONENT,
  ELEMENT,
  FRAGMENT,
  FUNCTION,
  NATIVE,
  PORTAL,
  TEXT,
  normalizeChildren,
  type ChildDescriptor,
} from '../core/view/children';
import { DefaultPortal } from '../core/api/portal';
import { CspNonceScope, validateCspNonce } from '../csp-nonce';
import { ELEMENT_TYPE, Fragment } from '../jsx';
import { renderAttrsDirect, resolveReactiveAttributeProps } from './attrs';
import {
  createRenderContext,
  throwSSRDataMissing,
  withRenderContext,
  type RenderContext,
  type RenderRouteState,
  type SSRData,
} from './context';
import {
  VOID_ELEMENTS,
  escapeRawText,
  escapeText,
  type RawTextElement,
} from './escape';
import { serializeHydrationRenderData } from './hydration-data';
import {
  getChildNamespace,
  getElementNamespace,
  getRawTextElementInContext,
  type SSRNamespace,
} from './namespace';
import { startRenderPhase, stopRenderPhase } from './render-keys';
import type { RouteAppRenderInput } from './route-render';
import { StringSink } from './sink';
import type { VNode } from './types';

/** The streaming target: `write` plus optional portal host tokens. */
type SinkTarget = {
  write(html: string): void;
  writePortalHost?: (token: string) => void;
};

/**
 * Collects writes so they can be published or dropped. An ErrorBoundary's
 * subtree renders into one first, so markup from a subtree that then throws
 * never reaches the response.
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

/** Buffers output once a portal host appears so tokens can be resolved. */
class PortalSink {
  private buffered: string[] | null = null;

  constructor(private readonly sink: { write(html: string): void }) {}

  write(html: string): void {
    if (!html) return;
    if (this.buffered) this.buffered.push(html);
    else this.sink.write(html);
  }

  writePortalHost(token: string): void {
    (this.buffered ??= []).push(token);
  }

  flush(ctx: RenderContext): void {
    if (this.buffered)
      this.sink.write(resolvePortals(this.buffered.join(''), ctx));
  }
}

// ---------------------------------------------------------------------------
// Render state (SSR is synchronous: one cursor per nested render)

interface ServerRender {
  ctx: RenderContext;
  owner: Owner;
  namespace: SSRNamespace;
  portalNamespaces: Map<string, SSRNamespace>;
}

let current: ServerRender | null = null;

function state(): ServerRender {
  if (!current) throw new Error('[Askr] No server render is active.');
  return current;
}

function withOwner<T>(owner: Owner, fn: () => T): T {
  const render = state();
  const previous = render.owner;
  render.owner = owner;
  try {
    return fn();
  } finally {
    render.owner = previous;
  }
}

function withNamespace<T>(namespace: SSRNamespace, fn: () => T): T {
  const render = state();
  const previous = render.namespace;
  render.namespace = namespace;
  try {
    return fn();
  } finally {
    render.namespace = previous;
  }
}

// ---------------------------------------------------------------------------
// Purity guard: server renders must be deterministic.

const guardStack: Array<{ random: () => number; now: () => number }> = [];

function pushPurityGuard(): void {
  if (process.env.NODE_ENV === 'production') return;
  guardStack.push({
    random: Reflect.get(Math, 'random') as () => number,
    now: Reflect.get(Date, 'now') as () => number,
  });
  Reflect.set(Math, 'random', () => {
    throw new Error(
      'SSR Strict Purity: Math.random is not allowed during synchronous SSR. Use the provided `ssr` context RNG instead.'
    );
  });
  Reflect.set(Date, 'now', () => {
    throw new Error(
      'SSR Strict Purity: Date.now is not allowed during synchronous SSR. Pass timestamps explicitly or use deterministic helpers.'
    );
  });
}

function popPurityGuard(): void {
  if (process.env.NODE_ENV === 'production') return;
  const previous = guardStack.pop();
  if (previous) {
    Reflect.set(Math, 'random', previous.random);
    Reflect.set(Date, 'now', previous.now);
  }
}

// ---------------------------------------------------------------------------
// Components

function runComponent(instance: ComponentInstance): unknown {
  pushPurityGuard();
  try {
    const output = instance.render();
    if (isPromiseLike(output)) throwSSRDataMissing();
    return output;
  } finally {
    popPurityGuard();
  }
}

function renderComponent(
  fn: ComponentFunction,
  props: Props,
  sink: SinkTarget
): void {
  const render = state();
  const instance = new ComponentInstance(render.owner, fn, props);
  instance.server = true;
  instance.serverContext = render.ctx;
  const output = runComponent(instance);
  if (!instance.boundary) {
    withOwner(instance, () => renderValue(output, sink));
    return;
  }

  // An error boundary: render the protected subtree into a buffer and drop
  // it (and any portal content it wrote) if it throws.
  const buffer = new BufferedSink();
  const restorePortals = capturePortalWrites(render.ctx);
  try {
    withOwner(instance, () => renderValue(output, buffer));
  } catch (error) {
    restorePortals();
    // End the lifetimes the failed subtree started.
    for (const child of [...(instance.owned ?? [])]) {
      if (child !== instance.computation) child.dispose();
    }
    if (!instance.boundary(error)) throw error;
    const fallback = runComponent(instance);
    withOwner(instance, () => renderValue(fallback, sink));
    return;
  }
  buffer.publishTo(sink);
}

function capturePortalWrites(ctx: RenderContext): () => void {
  const saved = new Map<object, { hasValue: boolean; value: unknown }>();
  for (const [key, slot] of ctx.ssrPortals.slots) {
    saved.set(key, { hasValue: slot.hasValue, value: slot.value });
  }
  return () => {
    for (const [key, slot] of ctx.ssrPortals.slots) {
      const previous = saved.get(key);
      slot.hasValue = previous?.hasValue ?? false;
      slot.value = previous?.value as typeof slot.value;
    }
  };
}

// ---------------------------------------------------------------------------
// Values

function isVNodeOf(value: unknown, type: symbol): value is VNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === type
  );
}

/** Render any renderable value. */
export function renderValue(value: unknown, sink: SinkTarget): void {
  if (Array.isArray(value)) {
    for (const item of value) renderValue(item, sink);
    return;
  }
  if (isVNodeOf(value, SSR_PORTAL_HOST)) {
    const token = String(value.props?.token ?? '');
    state().portalNamespaces.set(token, state().namespace);
    if (sink.writePortalHost) sink.writePortalHost(token);
    else sink.write(token);
    return;
  }
  if (isVNodeOf(value, DEFERRED_BOUNDARY)) {
    const id = String(value.props?.id ?? '');
    sink.write(`<askr-resolve data-askr-deferred="${id}">`);
    renderValue(value.props?.pending, sink);
    sink.write('</askr-resolve>');
    return;
  }
  for (const child of normalizeChildren(value)) renderChild(child, sink);
}

function renderChild(child: ChildDescriptor, sink: SinkTarget): void {
  switch (child.kind) {
    case TEXT:
      sink.write(escapeText(child.text));
      return;
    case ELEMENT:
      renderElement(child.tag, child.props, sink);
      return;
    case COMPONENT:
      renderComponent(child.fn, child.props, sink);
      return;
    case FRAGMENT: {
      const owner = child.owner as Owner | undefined;
      if (owner) withOwner(owner, () => renderValue(child.children, sink));
      else renderValue(child.children, sink);
      return;
    }
    case FUNCTION:
      renderValue(
        untrack(() => runWithOwner(state().owner, () => readValue(child.fn))),
        sink
      );
      return;
    case PORTAL:
    case NATIVE:
      // Client-only content.
      return;
  }
}

// ---------------------------------------------------------------------------
// Elements

function assertElementName(name: string): void {
  if (!/^[A-Za-z][A-Za-z0-9._:-]*$/.test(name)) {
    throw new TypeError(`Invalid SSR element name: ${JSON.stringify(name)}`);
  }
}

function renderElement(tag: string, props: Props, sink: SinkTarget): void {
  assertElementName(tag);
  if (VOID_ELEMENTS.has(tag)) {
    sink.write('<' + tag);
    renderAttrsDirect(props, sink, tag);
    sink.write(' />');
    return;
  }

  const render = state();
  const parentNamespace = render.namespace;
  const lower = tag.toLowerCase();
  const namespace = getElementNamespace(parentNamespace, lower);
  // `annotation-xml` reads its `encoding` to choose its children's context,
  // so a reactive value is read once for both.
  const elementProps =
    lower === 'annotation-xml'
      ? (resolveReactiveAttributeProps(props) ?? props)
      : props;
  const rawText = getRawTextElementInContext(parentNamespace, namespace, lower);
  withNamespace(
    getChildNamespace(parentNamespace, namespace, lower, elementProps),
    () => writeElement(tag, elementProps, rawText, sink)
  );
}

function writeElement(
  tag: string,
  props: Props,
  rawText: RawTextElement | null,
  sink: SinkTarget
): void {
  const dangerous = (props as { dangerouslySetInnerHTML?: unknown })
    .dangerouslySetInnerHTML;
  sink.write('<' + tag);
  renderAttrsDirect(props, sink, rawText === null ? tag : undefined);
  sink.write('>');
  if (dangerous !== undefined && dangerous !== null) {
    if (typeof dangerous === 'object' && '__html' in dangerous) {
      sink.write(String((dangerous as { __html: unknown }).__html));
    } else {
      renderValue(props.children, sink);
    }
  } else if (rawText !== null) {
    sink.write(escapeRawText(collectRawText(props.children, rawText), rawText));
  } else if (!props.imperativeChildren) {
    renderValue(props.children, sink);
  }
  sink.write('</' + tag + '>');
}

/**
 * The text of a `<script>` or `<style>`: collected unescaped and neutralized
 * as a whole. Element children are rejected rather than serialized as markup
 * the parser would read back as literal text.
 */
function collectRawText(value: unknown, element: RawTextElement): string {
  return flattenText(value, element).join('');
}

function flattenText(value: unknown, element: RawTextElement): string[] {
  const out: string[] = [];
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) {
      for (const entry of item) visit(entry);
      return;
    }
    for (const child of normalizeChildren(item)) {
      switch (child.kind) {
        case TEXT:
          out.push(child.text);
          break;
        case FRAGMENT:
          visit(child.children);
          break;
        case FUNCTION:
          visit(untrack(() => readValue(child.fn)));
          break;
        case COMPONENT: {
          const render = state();
          const instance = new ComponentInstance(
            render.owner,
            child.fn,
            child.props
          );
          instance.server = true;
          instance.serverContext = render.ctx;
          const output = runComponent(instance);
          withOwner(instance, () => visit(output));
          break;
        }
        case ELEMENT:
          throw new Error(
            `SSR: <${element}> children must be text, but received an element <${child.tag}>.`
          );
        default:
          throw new Error(
            `SSR: <${element}> children must be text, but received a non-text node.`
          );
      }
    }
  };
  visit(value);
  return out;
}

// ---------------------------------------------------------------------------
// Portals

function renderToString(value: unknown, namespace: SSRNamespace): string {
  const sink = new StringSink();
  withNamespace(namespace, () => renderValue(value, sink));
  sink.end();
  return sink.toString();
}

/** Replace portal host tokens with their portal's final content. */
function resolvePortals(html: string, ctx: RenderContext): string {
  let resolved = html;
  const rendered = new Set<string>();
  for (;;) {
    let found = false;
    for (const slot of ctx.ssrPortals.slots.values()) {
      const explicit = slot.hosts.filter((host) => !host.automatic);
      for (const host of slot.hosts) {
        if (rendered.has(host.token)) continue;
        found = true;
        rendered.add(host.token);
        const active = host.automatic ? explicit.length === 0 : true;
        const content =
          active && slot.hasValue
            ? renderToString(
                slot.value,
                state().portalNamespaces.get(host.token) ?? 'html'
              )
            : '';
        resolved = resolved.replace(host.token, () => content);
      }
    }
    if (!found) return resolved;
  }
}

// ---------------------------------------------------------------------------
// Entry points

function withServerRender<T>(ctx: RenderContext, fn: () => T): T {
  const previous = current;
  const owner = new Owner(null);
  current = {
    ctx,
    owner,
    namespace: 'html',
    portalNamespaces: new Map(),
  };
  let result: T;
  try {
    result = fn();
  } catch (error) {
    current = previous;
    owner.dispose();
    throw error;
  }
  current = previous;
  const errors = owner.dispose();
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, 'SSR temporary owner cleanup failed');
  }
  return result;
}

const AUTO_PORTAL = {
  $$typeof: ELEMENT_TYPE,
  type: DefaultPortal,
  props: { __askrAutoDefaultPortal: true },
  key: '__default_portal',
};

/** A root's output followed by the automatic default portal host. */
function withDefaultPortal(output: unknown): JSXElement {
  return {
    $$typeof: ELEMENT_TYPE,
    type: Fragment,
    props: {
      children: output == null ? [AUTO_PORTAL] : [output, AUTO_PORTAL],
    },
    key: null,
  } as unknown as JSXElement;
}

function rootElement(
  component: ComponentFunction,
  props: Props,
  nonce: string | undefined
): JSXElement {
  const Root: ComponentFunction = (_props, context) => {
    const output = component(props, context);
    if (isPromiseLike(output)) throwSSRDataMissing();
    return withDefaultPortal(output) as never;
  };
  Object.defineProperty(Root, 'name', { value: component.name || 'Component' });
  const element = {
    $$typeof: ELEMENT_TYPE,
    type: Root,
    props: {},
    key: null,
  } as unknown as JSXElement;
  return nonce === undefined
    ? element
    : CspNonceScope({ value: nonce, children: element });
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
    authContext?: AuthContext;
    /** @internal Request-local route state for deferred SSR passes. */
    route?: RenderRouteState;
    /** @internal Capture request-local registrations produced by this pass. */
    onContext?: (ctx: RenderContext) => void;
  }
): string {
  const nonce = validateCspNonce(options?.cspNonce);
  const ctx = createRenderContext(options?.seed ?? 12345, {
    data: options?.data,
    envelope: options?.envelope,
    cspNonce: nonce,
    authContext: options?.authContext,
    ...options?.route,
  });

  return withRenderContext(ctx, () => {
    startRenderPhase(ctx.renderData);
    try {
      return withServerRender(ctx, () => {
        const sink = new StringSink();
        renderValue(
          rootElement(
            component as ComponentFunction,
            (props ?? {}) as Props,
            nonce
          ),
          sink
        );
        sink.end();
        const html = resolvePortals(sink.toString(), ctx);
        options?.onContext?.(ctx);
        return (
          html +
          serializeHydrationRenderData(
            ctx.hydrationData ?? undefined,
            ctx.dataRuntime as import('../data/types').DataRuntime | undefined
          )
        );
      });
    } finally {
      stopRenderPhase();
    }
  });
}

export function renderSSRRouteAppToSink(input: RouteAppRenderInput): void {
  const { ctx, data, route, params, sink } = input;

  withRenderContext(ctx, () => {
    startRenderPhase(ctx.renderData);
    try {
      withServerRender(ctx, () => {
        const appSink = new PortalSink(sink);
        renderValue(
          rootElement(
            ((routeParams: Props) =>
              route.handler(routeParams as never)) as ComponentFunction,
            params as Props,
            ctx.cspNonce
          ),
          appSink
        );
        appSink.flush(ctx);
      });
      if (ctx.deferredBoundaries.length === 0) {
        sink.write(
          serializeHydrationRenderData(
            ctx.hydrationData ?? data,
            ctx.dataRuntime as import('../data/types').DataRuntime | undefined
          )
        );
      }
    } finally {
      stopRenderPhase();
    }
  });
}
