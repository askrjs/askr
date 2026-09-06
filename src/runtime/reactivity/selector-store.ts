import { requestRuntimeWork } from '../access';
import { ScheduledWork } from '../scheduled-work';

type DirtySelectorRecord = {
  _dirty: boolean;
  _pending: boolean;
};

const dirtySelectorRecords = new Set<DirtySelectorRecord>();
let selectorWork: ScheduledWork | undefined;

export function markDirtySelectorRecord<T extends DirtySelectorRecord>(
  record: T,
  flush: () => void
): void {
  record._dirty = true;
  if (!record._pending) {
    record._pending = true;
    dirtySelectorRecords.add(record);
  }
  requestRuntimeWork('derived', (selectorWork ??= new ScheduledWork(flush)));
}

export function takeDirtySelectorRecords<T extends DirtySelectorRecord>(): T[] {
  if (dirtySelectorRecords.size === 0) {
    return [];
  }

  const pending = Array.from(dirtySelectorRecords);
  dirtySelectorRecords.clear();
  return pending as T[];
}
