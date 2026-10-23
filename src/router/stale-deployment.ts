import { loadDocument } from './document-navigation';

/** Session marker: this document already reloaded once for a stale chunk. */
const RELOAD_MARKER = 'askr:stale-deployment-reload';

const DYNAMIC_IMPORT_FAILURE =
  /dynamically imported module|importing a module script failed|module script|loading chunk|chunkloaderror/i;

function unwrap(error: unknown): unknown {
  return error instanceof Error && 'cause' in error && error.cause
    ? error.cause
    : error;
}

/**
 * Whether a lazy import failed the way a deployment that replaced its chunk
 * files does: a `ChunkLoadError`, or the `TypeError` browsers throw for a
 * dynamic `import()` that could not fetch or evaluate its module.
 */
export function isStaleDeploymentError(error: unknown): boolean {
  const cause = unwrap(error);
  if (!(cause instanceof Error)) return false;
  return (
    cause.name === 'ChunkLoadError' ||
    (cause instanceof TypeError && DYNAMIC_IMPORT_FAILURE.test(cause.message))
  );
}

function storage(): Storage | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

/**
 * Load `href` as a document, once per browser session, because the page's
 * chunks no longer exist on the server. A marker stops a second attempt from
 * looping when the fresh document fails the same way; without storage to
 * record it, nothing reloads. Returns whether a reload started.
 */
export function reloadForStaleDeployment(
  error: unknown,
  href: string,
  history: 'push' | 'replace'
): boolean {
  if (typeof window === 'undefined' || !isStaleDeploymentError(error)) {
    return false;
  }
  const session = storage();
  if (!session) return false;
  try {
    if (session.getItem(RELOAD_MARKER) !== null) return false;
    session.setItem(RELOAD_MARKER, String(Date.now()));
  } catch {
    return false;
  }
  loadDocument(href, history);
  return true;
}

/** A chunk loaded, so the deployment is consistent again. */
export function clearStaleDeploymentMarker(): void {
  try {
    storage()?.removeItem(RELOAD_MARKER);
  } catch {
    // Nothing to forget without storage.
  }
}
