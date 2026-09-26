import { logger } from './logger';

/**
 * Report an error the way the host reports an uncaught listener exception.
 *
 * `reportError` dispatches a window `error` event (so global handlers and
 * monitoring see it) and lets the caller continue, matching native listener
 * semantics. Hosts without it get the same outcome from an async rethrow.
 * A throwing host reporter never interrupts the caller; the original error
 * and the reporter's failure are logged instead.
 */
export function reportUncaughtError(error: unknown): void {
  if (typeof globalThis.reportError === 'function') {
    try {
      globalThis.reportError(error);
    } catch (reportFailure) {
      logger.error('[Askr] reportError failed:', error, reportFailure);
    }
    return;
  }
  queueMicrotask(() => {
    throw error;
  });
}

let deferredErrors: unknown[] | undefined;

function flushDeferredErrors(): void {
  const errors = deferredErrors!;
  deferredErrors = undefined;
  for (const error of errors) reportUncaughtError(error);
}

/**
 * Report an error with `reportUncaughtError` once the current task finishes.
 *
 * Cleanup can fail in the middle of a render or commit. Deferring the report
 * keeps error handlers out of that work: they run after the DOM update, may
 * write state, and cannot interrupt or roll it back. Reports keep their order.
 */
export function reportUncaughtErrorLater(error: unknown): void {
  if (deferredErrors) {
    deferredErrors.push(error);
    return;
  }
  deferredErrors = [error];
  queueMicrotask(flushDeferredErrors);
}
