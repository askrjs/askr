import {
  type InvalidationEvent,
  addInvalidationListener,
} from '../data/testing';

/** A single recorded call to {@link invalidate}, captured by {@link createInvalidationRecorder}. */
export interface InvalidationRecord {
  prefix: string;
  markPendingWrite: boolean;
}

/** Recorder returned by {@link createInvalidationRecorder}. */
export interface InvalidationRecorder {
  readonly calls: readonly InvalidationRecord[];
  readonly prefixes: readonly string[];
  clear(): void;
  stop(): void;
}

/** Start recording {@link invalidate} calls for assertions; call `stop()` when done. */
export function createInvalidationRecorder(): InvalidationRecorder {
  const records: InvalidationRecord[] = [];
  let active = true;

  const unsubscribe = addInvalidationListener((event: InvalidationEvent) => {
    records.push({
      prefix: event.prefix,
      markPendingWrite: event.markPendingWrite,
    });
  });

  return {
    get calls() {
      return records.slice();
    },

    get prefixes() {
      return records.map((record) => record.prefix);
    },

    clear() {
      records.length = 0;
    },

    stop() {
      if (!active) {
        return;
      }

      active = false;
      unsubscribe();
    },
  };
}
