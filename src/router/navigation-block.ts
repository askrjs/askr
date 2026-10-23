/**
 * Navigation blockers: application predicates consulted before the router
 * leaves the current page, and (while any exists) before the document unloads.
 */
type Blocker = () => boolean | string;

const blockers = new Set<Blocker>();
let listening = false;
let leaveConfirmed = false;

function confirmLeave(message: string): boolean {
  return typeof window.confirm === 'function' ? window.confirm(message) : true;
}

/**
 * Whether leaving the page is allowed. The first blocker that objects decides:
 * `true` refuses silently (the application shows its own UI), a string asks the
 * visitor to confirm with that message.
 */
export function allowNavigationLeave(): boolean {
  for (const blocker of Array.from(blockers)) {
    const decision = blocker();
    if (decision === true) return false;
    if (typeof decision === 'string' && decision !== '') {
      if (!confirmLeave(decision)) return false;
      // The visitor already agreed; do not ask again if this ends in an unload.
      leaveConfirmed = true;
      queueMicrotask(() => {
        leaveConfirmed = false;
      });
      return true;
    }
  }
  return true;
}

export function hasNavigationBlockers(): boolean {
  return blockers.size > 0;
}

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (leaveConfirmed) return;
  for (const blocker of Array.from(blockers)) {
    const decision = blocker();
    if (decision === true || (typeof decision === 'string' && decision)) {
      event.preventDefault();
      // Legacy browsers require a value; none shows a custom message.
      event.returnValue = '';
      return;
    }
  }
}

/**
 * Ask before the router leaves the current page. `shouldBlock` is evaluated
 * when an in-app navigation (`navigate()`, `<Link>`) or a back/forward
 * traversal is attempted, and when the document is about to unload. Return
 * `true` to refuse, a string to ask the visitor to confirm with that message,
 * or `false` to allow. Returns a function that removes the blocker.
 *
 * Limitations: `updateRouteQuery()` and redirects are not blocked; a traversal
 * is undone with `history.go()` after the browser has moved, so it needs a
 * known history position and flashes the destination URL; browsers show their
 * own fixed text on unload, not the string.
 */
export function blockNavigation(
  shouldBlock: () => boolean | string
): () => void {
  if (typeof shouldBlock !== 'function') {
    throw new TypeError('blockNavigation() requires a function.');
  }
  const blocker: Blocker = () => shouldBlock();
  blockers.add(blocker);
  if (!listening && typeof window !== 'undefined') {
    listening = true;
    window.addEventListener('beforeunload', onBeforeUnload);
  }
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    blockers.delete(blocker);
    if (blockers.size === 0 && listening && typeof window !== 'undefined') {
      listening = false;
      window.removeEventListener('beforeunload', onBeforeUnload);
    }
  };
}

/** @internal Drop every blocker (router-wide reset). */
export function resetNavigationBlockers(): void {
  blockers.clear();
  if (listening && typeof window !== 'undefined') {
    window.removeEventListener('beforeunload', onBeforeUnload);
  }
  listening = false;
  leaveConfirmed = false;
}
