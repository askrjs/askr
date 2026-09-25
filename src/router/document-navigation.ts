/**
 * Hand a location the client router cannot render back to the browser.
 *
 * Kept in its own module so tests can observe document loads without
 * unloading the test document.
 */
export function loadDocument(href: string, history: 'push' | 'replace'): void {
  if (history === 'replace') window.location.replace(href);
  else window.location.assign(href);
}

/** Reload the document at the current history entry. */
export function reloadDocument(): void {
  window.location.reload();
}
