import { enqueueRuntimeLane } from './access';

type DirtySelectorRecord = {
  _dirty: boolean;
  _scheduled: boolean;
};

const dirtySelectorRecords = new Set<DirtySelectorRecord>();
let hasPendingSelectorFlush = false;

export function markDirtySelectorRecord<T extends DirtySelectorRecord>(
  record: T,
  flush: () => void
): void {
  record._dirty = true;
  if (record._scheduled) {
    return;
  }

  record._scheduled = true;
  dirtySelectorRecords.add(record);

  if (hasPendingSelectorFlush) {
    return;
  }

  hasPendingSelectorFlush = true;
  enqueueRuntimeLane('derived', flush);
}

export function takeDirtySelectorRecords<T extends DirtySelectorRecord>(): T[] {
  hasPendingSelectorFlush = false;

  if (dirtySelectorRecords.size === 0) {
    return [];
  }

  const pending = Array.from(dirtySelectorRecords);
  dirtySelectorRecords.clear();
  return pending as T[];
}
