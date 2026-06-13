export interface InvalidationEvent {
  prefix: string;
  markPendingWrite: boolean;
}

type InvalidationListener = (event: InvalidationEvent) => void;

const invalidationListeners = new Set<InvalidationListener>();

export function addInvalidationListener(
  listener: InvalidationListener
): () => void {
  invalidationListeners.add(listener);
  return () => {
    invalidationListeners.delete(listener);
  };
}

export function emitInvalidation(event: InvalidationEvent): void {
  for (const listener of invalidationListeners) {
    listener(event);
  }
}
