/**
 * Internal marker used to defer server portal host output until all writes in
 * the current render root are known.
 *
 * @internal
 */
export const SSR_PORTAL_HOST = Symbol.for('askr.ssr-portal-host');
export const SSR_PORTAL_ANCHOR = Symbol.for('askr.ssr-portal-anchor');

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
    id.length > 0 &&
    Array.from(id).every((char) => char >= '0' && char <= '9')
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
