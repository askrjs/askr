/**
 * Portals: content written in one place and rendered at a host elsewhere.
 *
 * A channel holds the latest writer and its content. A writer records its
 * content when its render commits; the host renders that content at the
 * host's position, owned by the writer, so the content lives and dies with
 * the writer and reads the writer's scopes. When a writer's lifetime ends it
 * clears the channel only if it is still the current writer.
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
import { currentComponent, onCommit } from './hooks';
import {
  holdUntilBoundaryRecovers,
  nearestErrorBoundary,
} from './error-boundary';
import {
  DEFAULT_SSR_PORTAL_KEY,
  createSSRPortalHost,
  writeSSRPortal,
} from '../../common/ssr-portals';

interface Write {
  readonly owner: Owner | null;
  readonly id: number;
  readonly children: unknown;
}

export interface PortalChannel {
  readonly write: Signal<Write | null>;
  /**
   * Explicit hosts currently mounted, or discarded by an ErrorBoundary
   * fallback that has not recovered; the automatic host yields to them.
   */
  readonly explicitHosts: Signal<number>;
  /** Render order of the write the channel shows. */
  renderOrder: number;
}

let nextWriteId = 0;

export function createPortalChannel(): PortalChannel {
  return {
    write: new Signal<Write | null>(null),
    explicitHosts: new Signal(0),
    renderOrder: 0,
  };
}

function renderWrite(write: Write | null): JSXElement | null {
  if (!write || isEmpty(write.children)) return null;
  return {
    $$typeof: ELEMENT_TYPE,
    type: OWNED_TYPE,
    props: { owner: write.owner, children: write.children },
    key: `portal:${write.id}`,
  } as unknown as JSXElement;
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === false;
}

/** Record `children` as `channel`'s content once the current render commits. */
function writeChannel(channel: PortalChannel, children: unknown): void {
  if (writeSSRPortal(ssrKey(channel), children as never, getOwner())) return;
  const instance = currentComponent();
  if (!instance) {
    channel.write.write({ owner: getOwner(), id: ++nextWriteId, children });
    return;
  }
  if (instance.server) return;
  let registered = writers.get(instance);
  if (!registered) {
    registered = new Set();
    writers.set(instance, registered);
  }
  if (!registered.has(channel)) {
    registered.add(channel);
    instance.onCleanup(() => {
      if (channel.write.peek()?.owner === instance) channel.write.write(null);
    });
  }
  // Writes commit children-first; render order decides which one shows.
  const order = ++nextRenderOrder;
  if (getRenderHost()?.isHydrating()) {
    // A hydrating host later in this render claims the server content now.
    const previous = channel.write.peek();
    const previousOrder = channel.renderOrder;
    channel.renderOrder = order;
    channel.write.write({
      owner: instance,
      id: previous?.owner === instance ? previous.id : ++nextWriteId,
      children,
    });
    recordUndo(() => {
      channel.write.write(previous);
      channel.renderOrder = previousOrder;
    });
  }
  instance.onCommitSync(() => {
    let written = lastWrites.get(instance);
    if (!written) {
      written = new Map();
      lastWrites.set(instance, written);
    }
    const repeated =
      written.has(channel) && Object.is(written.get(channel), children);
    written.set(channel, children);
    const current = channel.write.peek();
    if (current?.owner === instance && Object.is(current.children, children)) {
      return;
    }
    // Re-writing an unchanged value does not take the channel back from a
    // writer that rendered after this one.
    if (repeated || order < channel.renderOrder) return;
    channel.renderOrder = order;
    channel.write.write({
      owner: instance,
      id: current?.owner === instance ? current.id : ++nextWriteId,
      children,
    });
  });
}

const writers = new WeakMap<Owner, Set<PortalChannel>>();
/** Each writer's last committed value, per channel. */
const lastWrites = new WeakMap<Owner, Map<PortalChannel, unknown>>();
let nextRenderOrder = 0;

// ---------------------------------------------------------------------------
// Named portals

/** A named portal: render it as a component for the host; `.render()` writes. */
export interface Portal<T = unknown> {
  (): unknown;
  render(props: { children?: T }): null;
}

export function definePortal<T = unknown>(): Portal<T> {
  const channel = createPortalChannel();
  function PortalHost(): JSXElement | null {
    const ssr = createSSRPortalHost(channel, false);
    if (ssr) return ssr;
    const write = channel.write.read();
    if (!write) deferWhileHydrating();
    return renderWrite(write);
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
}): JSXElement | null {
  const automatic = props?.__askrAutoDefaultPortal === true;
  if (currentComponent()?.server) {
    return createSSRPortalHost(DEFAULT_SSR_PORTAL_KEY, automatic, true);
  }
  const channel = defaultChannel();
  if (automatic) {
    // The automatic host renders only while no explicit host is mounted.
    if (channel.explicitHosts.read() > 0) return null;
    const write = channel.write.read();
    if (!write) deferWhileHydrating();
    return renderWrite(write);
  }
  const instance = currentComponent();
  if (instance && !instance.server && !explicitHosts.has(instance)) {
    explicitHosts.add(instance);
    channel.explicitHosts.write(channel.explicitHosts.peek() + 1);
    recordUndo(() => {
      explicitHosts.delete(instance);
      channel.explicitHosts.write(channel.explicitHosts.peek() - 1);
    });
    const boundary = nearestErrorBoundary(instance);
    onCommit(instance, () => () => {
      const release = () =>
        channel.explicitHosts.write(channel.explicitHosts.peek() - 1);
      // A host that a boundary fallback discarded keeps the content off the
      // automatic host until the boundary recovers.
      if (!boundary || !holdUntilBoundaryRecovers(boundary, release)) {
        release();
      }
    });
  }
  const write = channel.write.read();
  if (!write) deferWhileHydrating();
  return renderWrite(write);
}

const explicitHosts = new WeakSet<Owner>();

/** A host rendered before its content: claim the server content later. */
function deferWhileHydrating(): void {
  const instance = currentComponent();
  if (instance) getRenderHost()?.deferHydration(instance);
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
