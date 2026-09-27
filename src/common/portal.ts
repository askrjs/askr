/**
 * Internal marker used to defer server portal host output until all writes in
 * the current render root are known.
 *
 * @internal
 */
export const SSR_PORTAL_HOST = Symbol.for('askr.ssr-portal-host');
export const SSR_PORTAL_ANCHOR = Symbol.for('askr.ssr-portal-anchor');

export interface PortalWriterOwner {
  readonly parent: PortalWriterOwner | null;
  readonly ownedIndex: number;
}

/** Compare writer positions in their owner trees, independent of activation order. */
export function comparePortalWriterOrder(
  left: PortalWriterOwner | null,
  right: PortalWriterOwner | null,
  leftSourceOrder?: number,
  rightSourceOrder?: number
): number {
  if (leftSourceOrder !== undefined && rightSourceOrder !== undefined) {
    return leftSourceOrder - rightSourceOrder;
  }
  const leftPath = portalWriterOrder(left);
  const rightPath = portalWriterOrder(right);
  const length = Math.min(leftPath.length, rightPath.length);
  for (let index = 0; index < length; index++) {
    if (leftPath[index] !== rightPath[index]) {
      return leftPath[index] - rightPath[index];
    }
  }
  return leftPath.length - rightPath.length;
}

function portalWriterOrder(owner: PortalWriterOwner | null): number[] {
  if (!owner) return [-1];
  const path: number[] = [];
  for (
    let current: PortalWriterOwner | null = owner;
    current;
    current = current.parent
  ) {
    path.push(current.ownedIndex);
  }
  return path.reverse();
}

const namedPortalHosts = new WeakSet<Function>();

export function markNamedPortalHost(host: Function): void {
  namedPortalHosts.add(host);
}

export function isNamedPortalHost(host: unknown): boolean {
  return typeof host === 'function' && namedPortalHosts.has(host);
}

const SSR_PORTAL_HOST_PREFIX = 'askr-portal:';
const SSR_PORTAL_ANCHOR_PREFIX = 'askr-portal-anchor:';

export function createSSRPortalHostToken(id: number): string {
  return `<!--${SSR_PORTAL_HOST_PREFIX}${id}-->`;
}

export function createSSRPortalAnchorToken(id: number): string {
  return `<!--${SSR_PORTAL_ANCHOR_PREFIX}${id}-->`;
}

function isSSRPortalMarkerData(data: string, prefix: string): boolean {
  if (!data.startsWith(prefix)) {
    return false;
  }
  const id = data.slice(prefix.length);
  return (
    id.length > 0 && Array.from(id).every((char) => char >= '0' && char <= '9')
  );
}

export function isSSRPortalHydrationAnchor(node: unknown): node is Comment {
  if (
    typeof node !== 'object' ||
    node === null ||
    (node as { nodeType?: number }).nodeType !== 8
  ) {
    return false;
  }
  const data = (node as { data?: unknown }).data;
  return (
    typeof data === 'string' &&
    (isSSRPortalMarkerData(data, SSR_PORTAL_HOST_PREFIX) ||
      isSSRPortalMarkerData(data, SSR_PORTAL_ANCHOR_PREFIX))
  );
}

export function isSSRPortalWriterAnchor(node: unknown): node is Comment {
  return (
    isSSRPortalHydrationAnchor(node) &&
    node.data.startsWith(SSR_PORTAL_ANCHOR_PREFIX)
  );
}
