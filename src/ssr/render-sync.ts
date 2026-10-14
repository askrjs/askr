/**
 * Synchronous server rendering.
 *
 * Components run on the same execution path as in the browser (a component
 * instance per element, positional hooks, scopes through the owner tree) and
 * their output is interpreted with the same child descriptors as the DOM
 * renderer. The server reads function children and props once, never
 * subscribes, and ends every lifetime when the render finishes.
 *
 * The output is plain HTML apart from private hydration markers when the
 * render contains preloaded resource slots. Portal hosts write tokens that
 * are replaced with their final content once the render root completes.
 */

import { clarifyRenderOverflow } from '../common/render-depth';
import { logger } from '../common/logger';
import { getCurrentRenderData } from '../common/render-context';
import type { AuthContext } from '@askrjs/auth';
import { DEFERRED_BOUNDARY } from '../common/deferred-value';
import type { JSXElement } from '../common/jsx';
import { createSSRPortalAnchorToken, SSR_PORTAL_HOST } from '../common/portal';
import { isPromiseLike } from '../common/promise';
import type { Props } from '../common/props';
import type { ComponentFunction } from '../common/component';
import { ComponentInstance } from '../core/component/instance';
import { untrack } from '../core/reactive/graph';
import { Owner } from '../core/reactive/owner';
import { readValue } from '../core/reactive/readable';
import {
  COMPONENT,
  ELEMENT,
  FRAGMENT,
  FUNCTION,
  NATIVE,
  TEXT,
  normalizeChildren,
  functionChildOutput,
  type ChildDescriptor,
} from '../core/view/children';
import { DefaultPortal, Portal } from '../core/api/portal';
import { CspNonceScope, validateCspNonce } from '../csp-nonce';
import { ELEMENT_TYPE, Fragment } from '../jsx';
import {
  renderAttrsDirect,
  resolveReactiveAttributeProps,
  type ReferenceAttributeCell,
} from './attrs';
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
import { BufferedSink, PortalSink, type SinkTarget } from './output-buffer';
import { ReferenceAttributes } from './output-reference';
import { capturePortalWrites, resolvePortals } from './output-portals';
import type { VNode } from './types';

// Private sibling-package bridge for ancestor attributes derived from rendered
// descendants. Ordinary hosts keep their existing attribute-first ordering.
const CHILDREN_BEFORE_ATTRS = Symbol.for('askr.ssr.children-before-attrs');
const ATTRIBUTE_ROOT = Symbol.for('askr.ssr.attribute-root');
const ATTRIBUTE_CELLS = Symbol.for('askr.ssr.attribute-cells');

// ---------------------------------------------------------------------------
// Render state (SSR is synchronous: one cursor per nested render)

interface ServerRender {
  ctx: RenderContext;
  owner: Owner;
  namespace: SSRNamespace;
  portalNamespaces: Map<string, SSRNamespace>;
  selectSelections: SelectSelection[];
  attributeRoots: WeakSet<Owner>;
  referenceAttributes: ReferenceAttributes;
}

interface SelectSelection {
  values: Set<string>;
  multiple: boolean;
  matched: boolean;
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

function componentOutput(value: unknown): unknown {
  return typeof value === 'function' ? null : value;
}

function renderComponent(
  fn: ComponentFunction,
  props: Props,
  sink: SinkTarget
): void {
  const render = state();
  const destination = sink;
  const attributeRoot =
    (props as Record<PropertyKey, unknown>)[ATTRIBUTE_ROOT] === true
      ? new BufferedSink(state().referenceAttributes)
      : null;
  if (attributeRoot) {
    attributeRoot.beginAttributeRoot();
    sink = attributeRoot;
  }
  let owner = render.owner;
  for (;;) {
    const instance = new ComponentInstance(owner, fn, props);
    instance.server = true;
    instance.serverContext = render.ctx;
    if (attributeRoot) render.attributeRoots.add(instance);
    const output = runComponent(instance);
    const resources = getCurrentRenderData()?.resources;
    if (
      instance.serverResourceKeys.length &&
      resources &&
      Object.keys(resources).some((key) => /^r:\d+$/.test(key))
    ) {
      sink.write(
        `<!--askr-resource:${instance.serverResourceKeys.join(',')}-->`
      );
    }
    if (fn === Portal) {
      sink.write(
        createSSRPortalAnchorToken(render.ctx.ssrPortals.nextHostId++)
      );
    }
    const next =
      instance.hooks.length === 0 && !instance.boundary
        ? selfComponentChild(output, fn)
        : null;
    if (next) {
      owner = instance;
      fn = next.fn;
      props = next.props;
      continue;
    }
    if (!instance.boundary) {
      withOwner(instance, () => renderValue(componentOutput(output), sink));
      attributeRoot?.publishTo(destination);
      return;
    }

    // An error boundary: render the protected subtree into a buffer and drop
    // it (and any portal content it wrote) if it throws.
    const buffer = new BufferedSink(state().referenceAttributes);
    const restorePortals = capturePortalWrites(render.ctx);
    try {
      withOwner(instance, () => renderValue(componentOutput(output), buffer));
    } catch (caught) {
      const error = clarifyRenderOverflow(caught);
      restorePortals();
      const cleanupErrors = disposeFailedSubtree(instance);
      try {
        if (!instance.boundary(error)) throw error;
        const fallback = runComponent(instance);
        withOwner(instance, () => renderValue(componentOutput(fallback), sink));
      } finally {
        reportBoundaryCleanupErrors(cleanupErrors);
      }
      attributeRoot?.publishTo(destination);
      return;
    }
    buffer.publishTo(sink);
    attributeRoot?.publishTo(destination);
    return;
  }
}

/**
 * End the lifetimes a failed boundary subtree started, newest first as in
 * `Owner.dispose()`, keeping the boundary's own render computation.
 */
export function disposeFailedSubtree(instance: ComponentInstance): unknown[] {
  const errors: unknown[] = [];
  const owned = instance.owned ? [...instance.owned] : [];
  for (let index = owned.length - 1; index >= 0; index--) {
    const child = owned[index];
    if (child && child !== instance.computation) {
      errors.push(...child.dispose());
    }
  }
  return errors;
}

function reportBoundaryCleanupErrors(errors: unknown[]): void {
  if (errors.length === 0) return;
  const failure =
    errors.length === 1
      ? errors[0]
      : new AggregateError(errors, 'SSR ErrorBoundary cleanup failed');
  logger.error('[Askr] SSR ErrorBoundary cleanup failed:', failure);
}

function selfComponentChild(
  output: unknown,
  fn: ComponentFunction
): Extract<ChildDescriptor, { kind: typeof COMPONENT }> | null {
  if (
    !output ||
    typeof output !== 'object' ||
    Array.isArray(output) ||
    (output as { type?: unknown }).type !== fn
  ) {
    return null;
  }
  const children = normalizeChildren(output);
  return children.length === 1 && children[0].kind === COMPONENT
    ? children[0]
    : null;
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
      renderComponent(
        () =>
          functionChildOutput(
            readValue(child.fn)
          ) as ReturnType<ComponentFunction>,
        {},
        sink
      );
      return;
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

/** Resolve only inputs needed to choose the child's parsing/selection context. */
function resolveEarlyContextProps(
  props: Props,
  names: readonly string[]
): Props {
  // Copy descriptors so unrelated getters and attribute functions stay late,
  // with their original enumeration order. This path is private and opt-in.
  const descriptors = Object.getOwnPropertyDescriptors(props);
  for (const name of names) {
    if (!(name in props)) continue;
    const value = props[name];
    descriptors[name] = {
      value:
        typeof value === 'function'
          ? untrack(() => readValue(value as () => unknown))
          : value,
      enumerable: descriptors[name]?.enumerable ?? true,
      configurable: true,
      writable: true,
    };
  }
  return Object.create(Object.getPrototypeOf(props), descriptors) as Props;
}

function renderElement(tag: string, props: Props, sink: SinkTarget): void {
  assertElementName(tag);
  if (VOID_ELEMENTS.has(tag)) {
    sink.write('<' + tag);
    renderHostAttrs(props, sink, tag);
    sink.write(' />');
    return;
  }

  const render = state();
  const childrenBeforeAttrs =
    (props as Props & { [CHILDREN_BEFORE_ATTRS]?: unknown })[
      CHILDREN_BEFORE_ATTRS
    ] === true;
  const parentNamespace = render.namespace;
  const lower = tag.toLowerCase();
  const namespace = getElementNamespace(parentNamespace, lower);
  // `annotation-xml` reads its `encoding` to choose its children's context,
  // so a reactive value is read once for both.
  let elementProps =
    lower === 'annotation-xml' ||
    (namespace === 'html' &&
      (lower === 'select' ||
        (lower === 'option' && parentNamespace === 'select')))
      ? childrenBeforeAttrs
        ? resolveEarlyContextProps(
            props,
            lower === 'annotation-xml'
              ? ['encoding']
              : lower === 'select'
                ? ['value', 'multiple']
                : ['value']
          )
        : (resolveReactiveAttributeProps(props, referenceCellsFor(props)) ??
          props)
      : props;
  const selection = render.selectSelections[render.selectSelections.length - 1];
  // A value-less option's value is its rendered text, so its children render
  // first (into a buffer) and the option is written once `selected` is known.
  let renderedChildren: BufferedSink | null = null;
  if (lower === 'option' && parentNamespace === 'select' && selection) {
    let value: string;
    const own = elementProps.value;
    // An omitted value attribute (`null`, `undefined`, `false`) falls back to
    // the option's text, as it does in the browser.
    if (own === undefined || own === null || own === false) {
      const buffer = new BufferedSink(state().referenceAttributes);
      const props = elementProps;
      withNamespace(
        getChildNamespace(parentNamespace, namespace, lower, props),
        () => writeContent(props, null, buffer)
      );
      renderedChildren = buffer;
      value = optionTextValue(buffer.html());
    } else {
      value = String(own);
    }
    const selected =
      selection.values.has(value) && (selection.multiple || !selection.matched);
    if (selected) selection.matched = true;
    if (childrenBeforeAttrs) {
      const descriptors = Object.getOwnPropertyDescriptors(elementProps);
      descriptors.selected = {
        value: selected,
        enumerable: true,
        configurable: true,
        writable: true,
      };
      elementProps = Object.create(
        Object.getPrototypeOf(elementProps),
        descriptors
      ) as Props;
    } else {
      elementProps = { ...elementProps, selected };
    }
  }
  if (renderedChildren) {
    if (childrenBeforeAttrs) {
      writeBufferedElement(tag, elementProps, null, sink, renderedChildren);
      return;
    }
    sink.write('<' + tag);
    renderHostAttrs(elementProps, sink, tag);
    sink.write('>');
    renderedChildren.publishTo(sink);
    sink.write('</' + tag + '>');
    return;
  }
  let nextSelection: SelectSelection | null = null;
  if (
    lower === 'select' &&
    namespace === 'html' &&
    elementProps.value != null
  ) {
    const multiple = Boolean(elementProps.multiple);
    const value = elementProps.value;
    nextSelection = {
      values: new Set(
        multiple && Array.isArray(value) ? value.map(String) : [String(value)]
      ),
      multiple,
      matched: false,
    };
    render.selectSelections.push(nextSelection);
  }
  const rawText = getRawTextElementInContext(parentNamespace, namespace, lower);
  try {
    withNamespace(
      getChildNamespace(parentNamespace, namespace, lower, elementProps),
      () => writeElement(tag, elementProps, rawText, sink, childrenBeforeAttrs)
    );
  } finally {
    if (nextSelection) render.selectSelections.pop();
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
};

/** Decode the entity starting at `start` (`&...;`), or null if unknown. */
function decodeEntity(
  html: string,
  start: number
): { text: string; end: number } | null {
  const end = html.indexOf(';', start + 1);
  if (end < 0 || end - start > 12) return null;
  const name = html.slice(start + 1, end);
  if (name.startsWith('#')) {
    const hex = name[1] === 'x' || name[1] === 'X';
    const code = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return null;
    return { text: String.fromCodePoint(code), end };
  }
  const text = NAMED_ENTITIES[name];
  return text === undefined ? null : { text, end };
}

function isAsciiWhitespace(code: number): boolean {
  return (
    code === 0x20 ||
    code === 0x09 ||
    code === 0x0a ||
    code === 0x0c ||
    code === 0x0d
  );
}

/**
 * The value a browser gives a value-less `<option>` rendered as `html`: its
 * text content with ASCII whitespace stripped and collapsed. The markup is
 * this renderer's own output, so tags, comments, and the three entities the
 * text escaper emits are all there is to undo.
 */
function optionTextValue(html: string): string {
  let text = '';
  let pendingSpace = false;
  let i = 0;
  while (i < html.length) {
    const ch = html[i];
    if (ch === '<') {
      if (html.startsWith('<!--', i)) {
        const end = html.indexOf('-->', i + 4);
        i = end < 0 ? html.length : end + 3;
        continue;
      }
      const end = html.indexOf('>', i + 1);
      if (end < 0) break;
      // Script text is not part of an option's text.
      if (html.slice(i + 1, i + 7).toLowerCase() === 'script') {
        const close = html.toLowerCase().indexOf('</script', end);
        const closeEnd = close < 0 ? -1 : html.indexOf('>', close);
        i = closeEnd < 0 ? html.length : closeEnd + 1;
        continue;
      }
      i = end + 1;
      continue;
    }
    let decoded = ch;
    if (ch === '&') {
      const entity = decodeEntity(html, i);
      if (entity) {
        decoded = entity.text;
        i = entity.end;
      }
    }
    i++;
    for (const part of decoded) {
      if (isAsciiWhitespace(part.charCodeAt(0))) {
        pendingSpace = text.length > 0;
        continue;
      }
      if (pendingSpace) text += ' ';
      pendingSpace = false;
      text += part;
    }
  }
  return text;
}

function writeBufferedElement(
  tag: string,
  props: Props,
  rawText: RawTextElement | null,
  sink: SinkTarget,
  children: BufferedSink
): void {
  // Attribute getters can throw as well. Publish no host prefix until every
  // late attribute has resolved successfully.
  const opening = new BufferedSink(state().referenceAttributes);
  opening.write('<' + tag);
  renderHostAttrs(props, opening, rawText === null ? tag : undefined);
  opening.write('>');
  opening.publishTo(sink);
  children.publishTo(sink);
  sink.write('</' + tag + '>');
}

function writeElement(
  tag: string,
  props: Props,
  rawText: RawTextElement | null,
  sink: SinkTarget,
  childrenBeforeAttrs: boolean
): void {
  if (childrenBeforeAttrs) {
    const children = new BufferedSink(state().referenceAttributes);
    writeContent(props, rawText, children);
    writeBufferedElement(tag, props, rawText, sink, children);
    return;
  }
  sink.write('<' + tag);
  renderHostAttrs(props, sink, rawText === null ? tag : undefined);
  sink.write('>');
  writeContent(props, rawText, sink);
  sink.write('</' + tag + '>');
}

/** An element's content: raw HTML, raw text, or rendered children. */
function writeContent(
  props: Props,
  rawText: RawTextElement | null,
  sink: SinkTarget
): void {
  const dangerous = (props as { dangerouslySetInnerHTML?: unknown })
    .dangerouslySetInnerHTML;
  if (dangerous !== undefined && dangerous !== null) {
    if (typeof dangerous === 'object' && '__html' in dangerous) {
      const html = (dangerous as { __html: unknown }).__html;
      // Like the client, a null or undefined payload renders no content.
      if (html !== null && html !== undefined) sink.write(String(html));
    } else {
      renderValue(props.children, sink);
    }
  } else if (rawText !== null) {
    sink.write(escapeRawText(collectRawText(props.children, rawText), rawText));
  } else if (!props.imperativeChildren) {
    renderValue(props.children, sink);
  }
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
          visit(functionChildOutput(untrack(() => readValue(child.fn))));
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
          if (!instance.boundary) {
            withOwner(instance, () => visit(componentOutput(output)));
            break;
          }
          const start = out.length;
          const restorePortals = capturePortalWrites(render.ctx);
          try {
            withOwner(instance, () => visit(componentOutput(output)));
          } catch (caught) {
            const error = clarifyRenderOverflow(caught);
            out.length = start;
            restorePortals();
            const cleanupErrors = disposeFailedSubtree(instance);
            try {
              if (!instance.boundary(error)) throw error;
              const fallback = runComponent(instance);
              withOwner(instance, () => visit(componentOutput(fallback)));
            } finally {
              reportBoundaryCleanupErrors(cleanupErrors);
            }
          }
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

function referenceCellsFor(props: Props) {
  const cells = (props as Record<PropertyKey, unknown>)[ATTRIBUTE_CELLS];
  if (!cells || typeof cells !== 'object') return undefined;
  const render = state();
  for (let owner: Owner | null = render.owner; owner; owner = owner.parent) {
    if (render.attributeRoots.has(owner)) {
      return cells as Record<string, ReferenceAttributeCell>;
    }
  }
  return undefined;
}

function renderHostAttrs(props: Props, sink: SinkTarget, tag?: string) {
  const cells = referenceCellsFor(props);
  if (!cells) {
    renderAttrsDirect(props, sink, tag);
    return;
  }
  // Even a plain string sink retains cells until the complete root and its
  // portals have rendered. Ordinary properties still resolve right here.
  renderAttrsDirect(
    props,
    {
      write: (html) => sink.write(html),
      writeReferenceAttribute: (name, cell) => {
        if (sink.writeReferenceAttribute)
          sink.writeReferenceAttribute(name, cell);
        else sink.write(state().referenceAttributes.token(name, cell));
      },
    },
    tag,
    cells
  );
}

function renderToString(value: unknown, namespace: SSRNamespace): string {
  const sink = new StringSink();
  withNamespace(namespace, () => renderValue(value, sink));
  sink.end();
  return sink.toString();
}

/** Portal traversal stays with the renderer; output modules own finalization. */
function finalizeOutput(html: string, ctx: RenderContext): string {
  const render = state();
  return render.referenceAttributes.resolve(
    resolvePortals(html, ctx, (write, host) =>
      withOwner((write.owner as Owner | null) ?? render.owner, () =>
        renderToString(
          write.value,
          render.portalNamespaces.get(host.token) ?? 'html'
        )
      )
    )
  );
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
    selectSelections: [],
    attributeRoots: new WeakSet(),
    referenceAttributes: new ReferenceAttributes(),
  };
  let result: T;
  try {
    result = fn();
  } catch (error) {
    current = previous;
    const cleanupErrors = owner.dispose();
    const failure = clarifyRenderOverflow(error);
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [failure, ...cleanupErrors],
        'SSR render failed and temporary owner cleanup also failed'
      );
    }
    throw failure;
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
        const html = finalizeOutput(sink.toString(), ctx);
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
        const appSink = new PortalSink(
          sink,
          state().referenceAttributes,
          (html) => finalizeOutput(html, ctx)
        );
        renderValue(
          rootElement(
            ((routeParams: Props) =>
              route.handler(routeParams as never)) as ComponentFunction,
            params as Props,
            ctx.cspNonce
          ),
          appSink
        );
        appSink.flush();
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
