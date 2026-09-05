import { describe, expect, it, vi } from 'vite-plus/test';
import {
  createComponentInstance,
  cleanupComponent,
} from '../../../src/runtime/component';
import {
  createDataRuntime,
  resolveDataRuntimeState,
  getQuerySlotStore,
  ensureQueryCleanup,
} from '../../../src/data/data-runtime';
import { QueryCell } from '../../../src/data/query-cell';

describe('owned query cleanup', () => {
  it('should drain query attachments and remove departed bookkeeping after a detach failure', () => {
    const runtime = resolveDataRuntimeState(createDataRuntime());
    const instance = createComponentInstance('queries', () => null, {}, null);
    instance.cleanupStrict = true;
    const generation = instance.ownership.identity;
    const sharedGeneration = {};
    const first = new QueryCell(
      { key: 'first', fetch: async () => 1, initialData: 1 },
      'first',
      runtime.queryCache
    );
    const second = new QueryCell(
      { key: 'second', fetch: async () => 2, initialData: 2 },
      'second',
      runtime.queryCache
    );
    runtime.queryCache.set('first', first);
    runtime.queryCache.set('second', second);
    first.attach(generation, 0);
    second.attach(generation, 1);
    second.attach(sharedGeneration, 0);
    const slots = getQuerySlotStore(runtime, instance);
    slots.set(0, { key: 'first', cell: first });
    slots.set(1, { key: 'second', cell: second });
    ensureQueryCleanup(runtime, instance);
    const detach = first.detach.bind(first);
    vi.spyOn(first, 'detach').mockImplementation((owner, hook) => {
      detach(owner, hook);
      throw new Error('detach failed');
    });
    const secondDetach = vi.spyOn(second, 'detach');
    expect(() => cleanupComponent(instance)).toThrow(AggregateError);
    expect(secondDetach).toHaveBeenCalledWith(generation, 1);
    expect(slots.size).toBe(0);
    expect(runtime.querySlotsByGeneration.has(generation)).toBe(false);
    expect(runtime.queryCleanupRegistered.has(generation)).toBe(false);
    expect(runtime.queryCache.get('second')).toBe(second);
    cleanupComponent(instance);
    expect(secondDetach).toHaveBeenCalledOnce();
    second.detach(sharedGeneration, 0);
    expect(runtime.queryCache.size).toBe(0);
  });
});
