/**
 * Report an error the way the host reports an uncaught listener exception.
 *
 * `reportError` dispatches a window `error` event (so global handlers and
 * monitoring see it) and lets the caller continue, matching native listener
 * semantics. Hosts without it get the same outcome from an async rethrow.
 */
export function reportUncaughtError(error: unknown): void {
  if (typeof globalThis.reportError === 'function') {
    globalThis.reportError(error);
    return;
  }
  queueMicrotask(() => {
    throw error;
  });
}
