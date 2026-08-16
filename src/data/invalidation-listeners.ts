export interface InvalidationEvent {
  prefix: string;
  markPendingWrite: boolean;
}

type InvalidationListener = (event: InvalidationEvent) => void;

const invalidationListeners = new Set<InvalidationListener>();
const activeInvalidationPrefixes: string[] = [];
const MAX_INVALIDATION_CASCADE_DEPTH = 100;

export function addInvalidationListener(
  listener: InvalidationListener
): () => void {
  invalidationListeners.add(listener);
  return () => {
    invalidationListeners.delete(listener);
  };
}

export function emitInvalidation(event: InvalidationEvent): void {
  if (activeInvalidationPrefixes.includes(event.prefix)) {
    throw new Error(
      `[Askr] Cyclic invalidation cascade detected for prefix ${JSON.stringify(event.prefix)}.`
    );
  }
  if (activeInvalidationPrefixes.length >= MAX_INVALIDATION_CASCADE_DEPTH) {
    throw new Error(
      `[Askr] Invalidation cascade exceeded ${MAX_INVALIDATION_CASCADE_DEPTH} nested events at prefix ${JSON.stringify(event.prefix)}.`
    );
  }

  activeInvalidationPrefixes.push(event.prefix);
  try {
    for (const listener of invalidationListeners) {
      listener(event);
    }
  } finally {
    activeInvalidationPrefixes.pop();
  }
}
