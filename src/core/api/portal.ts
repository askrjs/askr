/**
 * Portals: content written in one place and rendered at a host elsewhere.
 *
 * A channel holds ordered writer records. Each writer's content commits to
 * its own record and renders at the host's position, owned by that writer, so
 * the content lives and dies with the writer and reads the writer's scopes.
 *
 * Each application root provides a default channel; `<Portal>` writes to it
 * and `<DefaultPortal>` (or the automatic host a root appends) renders it.
 */

import { ELEMENT_TYPE, type JSXElement } from '../../common/jsx';
import { recordUndo } from '../component/journal';
import { getRenderHost } from '../component/instance';
import { Owner, getOwner } from '../reactive/owner';
import { Signal } from '../reactive/graph';
import { OWNED_TYPE } from '../view/children';
import { currentComponent } from './hooks';
import { deliverToBoundary } from '../component/errors';
import {
  ErrorBoundary,
  holdUntilBoundaryRecovers,
  nearestErrorBoundary,
} from './error-boundary';
import {
  DEFAULT_SSR_PORTAL_KEY,
  createSSRPortalHost,
  writeSSRPortal,
} from '../../common/ssr-portals';
import { comparePortalWriterOrder } from '../../common/portal';

interface Write {
  readonly owner: Owner | null;
  readonly id: number;
  readonly children: Signal<unknown>;
}

export interface PortalChannel {
  /** Ordered, independently owned writers targeting this channel. */
  readonly writes: Signal<readonly Write[]>;
  /**
   * Explicit hosts currently mounted, or discarded by an ErrorBoundary
   * fallback that has not recovered; the automatic host yields to them.
   */
  readonly explicitHosts: Signal<number>;
}

let nextWriteId = 0;

function createWrite(owner: Owner | null, children: unknown): Write {
  return {
    owner,
    id: ++nextWriteId,
    children: new Signal(children),
  };
}

export function createPortalChannel(): PortalChannel {
  return {
    writes: new Signal<readonly Write[]>([]),
    explicitHosts: new Signal(0),
  };
}

function renderWrite(writes: readonly Write[]): JSXElement[] {
  return [...writes].sort(compareWrites).map(
    (write) =>
      ({
        $$typeof: ELEMENT_TYPE,
        type: OWNED_TYPE,
        props: {
          owner: write.owner,
          children: {
            $$typeof: ELEMENT_TYPE,
            type: PortalLayer,
            props: { write },
          },
        },
        key: `portal:${write.id}`,
      }) as unknown as JSXElement
  );
}

function PortalLayer(props: { write: Write }): JSXElement {
  const children = props.write.children.read();
  return {
    $$typeof: ELEMENT_TYPE,
    type: ErrorBoundary,
    props: {
      children,
      fallback: (error: unknown) => {
        if (deliverToBoundary(props.write.owner, error)) return null;
        throw error;
      },
    },
  } as unknown as JSXElement;
}

/** Record `children` as `channel`'s content once the current render commits. */
function writeChannel(channel: PortalChannel, children: unknown): void {
  if (writeSSRPortal(ssrKey(channel), children as never, getOwner())) return;
  const instance = currentComponent();
  if (!instance) {
    let write = imperativeWriters.get(channel);
    if (!write) {
      write = createWrite(null, children);
      imperativeWriters.set(channel, write);
      addWrite(channel, write);
    } else {
      write.children.write(children);
    }
    return;
  }
  if (instance.server) return;
  let owned = writers.get(instance);
  if (!owned) writers.set(instance, (owned = new Map()));
  let write = owned.get(channel);
  const created = !write;
  const previousChildren = write?.children.peek();
  if (!write) {
    write = createWrite(instance, children);
    owned.set(channel, write);
  }
  const record = write;
  const apply = () => {
    addWrite(channel, record);
    record.children.write(children);
  };
  if (getRenderHost()?.isHydrating()) {
    apply();
    recordUndo(() => {
      if (created) {
        removeWrite(channel, record);
        owned!.delete(channel);
      } else {
        record.children.write(previousChildren);
      }
    });
  }
  if (created) {
    instance.onCleanup(() => {
      owned!.delete(channel);
      removeWrite(channel, record);
    });
  }
  instance.onCommitSync(() => {
    apply();
  });
}

const writers = new WeakMap<Owner, Map<PortalChannel, Write>>();
const imperativeWriters = new WeakMap<PortalChannel, Write>();
function addWrite(channel: PortalChannel, write: Write): void {
  if (channel.writes.peek().some((item) => item === write)) return;
  channel.writes.write([...channel.writes.peek(), write].sort(compareWrites));
}

function compareWrites(left: Write, right: Write): number {
  const leftPosition = sourcePosition(left.owner);
  const rightPosition = sourcePosition(right.owner);
  if (leftPosition && rightPosition) {
    if (leftPosition.container === rightPosition.container) {
      const length = Math.min(
        leftPosition.path.length,
        rightPosition.path.length
      );
      for (let index = 0; index < length; index++) {
        if (leftPosition.path[index] !== rightPosition.path[index]) {
          return leftPosition.path[index] - rightPosition.path[index];
        }
      }
      if (leftPosition.path.length !== rightPosition.path.length) {
        return leftPosition.path.length - rightPosition.path.length;
      }
    } else {
      const relation = leftPosition.container.compareDocumentPosition(
        rightPosition.container
      );
      if (relation & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (relation & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    }
  }
  return comparePortalWriterOrder(left.owner, right.owner);
}

function sourcePosition(
  owner: Owner | null
): { container: Element; path: number[] } | null {
  if (!owner || typeof Node === 'undefined') return null;
  let node = (owner as Owner & { view?: RenderTreeNode }).view;
  const path: number[] = [];
  while (node?.parent) {
    const parent = node.parent;
    if ('children' in parent && Array.isArray(parent.children)) {
      path.unshift(parent.children.indexOf(node));
    }
    if ('el' in parent && parent.el instanceof Element) {
      return { container: parent.el, path };
    }
    node = parent;
  }
  return null;
}

interface RenderTreeNode {
  readonly parent?: RenderTreeNode | null;
  readonly children?: readonly RenderTreeNode[];
  readonly el?: Element;
}

function removeWrite(channel: PortalChannel, write: Write): void {
  const writes = channel.writes.peek();
  if (!writes.includes(write)) return;
  channel.writes.write(writes.filter((item) => item !== write));
}

// ---------------------------------------------------------------------------
// Named portals

/** A named portal: render it as a component for the host; `.render()` writes. */
export interface Portal<T = unknown> {
  (): unknown;
  render(props: { children?: T }): null;
}

export function definePortal<T = unknown>(): Portal<T> {
  const channel = createPortalChannel();
  function PortalHost(): JSXElement | JSXElement[] | null {
    const ssr = createSSRPortalHost(channel, false);
    if (ssr) return ssr;
    deferWhileHydrating();
    return renderWrite(channel.writes.read());
  }
  PortalHost.render = (props: { children?: T }): null => {
    writeChannel(channel, props.children);
    return null;
  };
  portalChannels.set(PortalHost, channel);
  return PortalHost as Portal<T>;
}

const portalChannels = new WeakMap<object, PortalChannel>();

/** The channel behind a portal created by {@link definePortal}. */
export function channelOf(portal: object): PortalChannel | undefined {
  return portalChannels.get(portal);
}

// ---------------------------------------------------------------------------
// The default portal

const DEFAULT_CHANNEL = Symbol('askr.default-portal');
let fallbackChannel: PortalChannel | null = null;
let fallbackAdoptable = false;
const rootChannels = new Map<Element, PortalChannel>();

/** Give everything rendered under `owner` its own default portal. */
export function provideDefaultPortal(
  owner: Owner,
  root?: Element
): PortalChannel {
  const channel =
    root && rootChannels.size === 0 && fallbackAdoptable && fallbackChannel
      ? fallbackChannel
      : createPortalChannel();
  if (root) {
    rootChannels.set(root, channel);
    fallbackChannel = null;
    fallbackAdoptable = false;
    owner.onCleanup(() => {
      if (rootChannels.get(root) === channel) rootChannels.delete(root);
    });
  }
  (owner.context ??= new Map()).set(DEFAULT_CHANNEL, channel);
  return channel;
}

/** Server renders collect default-portal writes under one key. */
function ssrKey(channel: PortalChannel): object {
  return channel === serverDefaultChannel ? DEFAULT_SSR_PORTAL_KEY : channel;
}

const serverDefaultChannel = createPortalChannel();

function defaultChannel(): PortalChannel {
  if (currentComponent()?.server) return serverDefaultChannel;
  const provided = getOwner()?.lookup(DEFAULT_CHANNEL) as
    | PortalChannel
    | undefined;
  if (provided) return provided;
  let connected: PortalChannel | null = null;
  for (const [root, channel] of rootChannels) {
    if (!root.isConnected) continue;
    if (connected) {
      fallbackAdoptable = false;
      return fallbackChannel ?? (fallbackChannel = createPortalChannel());
    }
    connected = channel;
  }
  if (connected) return connected;
  fallbackAdoptable = rootChannels.size === 0;
  return fallbackChannel ?? (fallbackChannel = createPortalChannel());
}

export interface PortalProps {
  children?: unknown;
}

/** Write `children` to the default portal. */
export function Portal(props: PortalProps): null {
  writeChannel(defaultChannel(), props.children);
  return null;
}

/** Render the default portal's content here. */
export function DefaultPortal(props?: {
  __askrAutoDefaultPortal?: boolean;
}): JSXElement | JSXElement[] | null {
  const automatic = props?.__askrAutoDefaultPortal === true;
  if (currentComponent()?.server) {
    return createSSRPortalHost(DEFAULT_SSR_PORTAL_KEY, automatic, true);
  }
  const channel = defaultChannel();
  if (automatic) {
    // The automatic host renders only while no explicit host is mounted.
    if (channel.explicitHosts.read() > 0) return null;
    deferWhileHydrating();
    return renderWrite(channel.writes.read());
  }
  const instance = currentComponent();
  if (instance && !instance.server && !explicitHosts.has(instance)) {
    explicitHosts.add(instance);
    channel.explicitHosts.write(channel.explicitHosts.peek() + 1);
    // The count is released with the host's lifetime, not after its commit
    // task: a host can be unmounted in the flush that mounted it, before
    // post-commit work runs. A discarded render undoes the count instead.
    let counted = true;
    recordUndo(() => {
      counted = false;
      explicitHosts.delete(instance);
      channel.explicitHosts.write(channel.explicitHosts.peek() - 1);
    });
    const boundary = nearestErrorBoundary(instance);
    instance.onCleanup(() => {
      if (!counted) return;
      counted = false;
      const release = () =>
        channel.explicitHosts.write(channel.explicitHosts.peek() - 1);
      // A host that a boundary fallback discarded keeps the content off the
      // automatic host until the boundary recovers.
      if (!boundary || !holdUntilBoundaryRecovers(boundary, release)) {
        release();
      }
    });
  }
  deferWhileHydrating();
  return renderWrite(channel.writes.read());
}

const explicitHosts = new WeakSet<Owner>();

/** A host rendered before its content: claim the server content later. */
function deferWhileHydrating(): void {
  const instance = currentComponent();
  if (instance?.mounted === false) getRenderHost()?.deferHydration(instance);
}

/** `DefaultPortal.render()` writes to the default portal, like `<Portal>`. */
DefaultPortal.render = (props: PortalProps): null => {
  writeChannel(defaultChannel(), props.children);
  return null;
};

/** Test isolation: forget the fallback default portal. */
export function resetDefaultPortal(): void {
  fallbackChannel = null;
  fallbackAdoptable = false;
}
