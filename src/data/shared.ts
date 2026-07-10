import {
  markReadableDerivedSubscribersDirty,
  markReactivePropsDirtySource,
  notifyReadableReaders,
  type ReadableSource,
} from '../runtime';

export function createReadableSource(): ReadableSource<unknown> {
  return (() => undefined) as ReadableSource<unknown>;
}

export function notifySource(source: ReadableSource<unknown>): void {
  markReadableDerivedSubscribersDirty(source);
  markReactivePropsDirtySource(source);
  notifyReadableReaders(source);
}

export function isAbortError(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted ||
    (error instanceof Error && error.name === 'AbortError') ||
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError')
  );
}

export function normalizeAsyncDataError(
  error: unknown,
  fallbackMessage: string
): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(error == null ? fallbackMessage : String(error));
}
