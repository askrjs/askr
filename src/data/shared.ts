export {
  createSource as createReadableSource,
  notify as notifySource,
  readSource as recordReadableRead,
  type ReadableSource,
} from '../core/api/hooks';

export function isAbortError(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (error instanceof Error && error.name === 'AbortError') ||
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError')
  );
}

/** Whether an async result still belongs to the latest generation. */
export function isCurrentAsyncGeneration(
  currentGeneration: number,
  capturedGeneration: number
): boolean {
  return currentGeneration === capturedGeneration;
}

/** Whether an async result still owns both its generation and controller. */
export function isCurrentAsyncOperation(
  currentGeneration: number,
  capturedGeneration: number,
  currentController: AbortController | null,
  capturedController: AbortController
): boolean {
  return (
    isCurrentAsyncGeneration(currentGeneration, capturedGeneration) &&
    currentController === capturedController
  );
}

export function normalizeAsyncDataError(
  error: unknown,
  fallbackMessage: string
): Error {
  try {
    if (error instanceof Error) {
      return error;
    }
    return new Error(error == null ? fallbackMessage : String(error));
  } catch {
    return new Error(fallbackMessage);
  }
}

/** Settle promptly on abort, while observing uncancellable late completions. */
export function raceAbort<T>(
  promise: Promise<T>,
  signals: readonly AbortSignal[],
  deferAbort = false
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      for (const signal of signals) signal.removeEventListener('abort', abort);
    };
    const rejectForAbort = () => {
      cleanup();
      reject(signals.find((signal) => signal.aborted)!.reason);
    };
    const abort = () => {
      if (deferAbort) queueMicrotask(rejectForAbort);
      else rejectForAbort();
    };
    for (const signal of signals) signal.addEventListener('abort', abort);
    if (signals.some((signal) => signal.aborted)) abort();
    void promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
  });
}
