/**
 * Hand a location no registered app can render to the browser as a document
 * load, keeping the requested history mode.
 */
export function loadDocument(href: string, history: 'push' | 'replace'): void {
  if (history === 'replace') window.location.replace(href);
  else window.location.assign(href);
}

/** Reload the document at the current history entry. */
export function reloadDocument(): void {
  window.location.reload();
}
