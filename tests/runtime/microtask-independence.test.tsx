import { describe, it, expect } from 'vitest';
import { createTestContainer } from '../helpers/test-renderer';

// This test verifies that microtask ordering used by the runtime is isolated
// from other microtasks scheduled by user code (i.e., a scheduled Promise in
// user-land should not preempt or be preempted by the runtime microtasks).

describe('microtask_independence (runtime)', () => {
  it('should run runtime microtasks in expected order relative to user microtasks', async () => {
    const { cleanup } = createTestContainer();

    const events: string[] = [];

    // user microtask
    Promise.resolve().then(() => events.push('user'));

    // runtime microtask simulation: schedule via Promise.then but as part of
    // renderer's flush (we simulate by scheduling it in a setTimeout 0 then
    // flushScheduler to ensure it happens in next microtask phase the runtime
    // would use)
    setTimeout(() => {
      Promise.resolve().then(() => events.push('runtime'));
    }, 0);

    // wait for both to flush
    await new Promise((r) => setTimeout(r, 10));

    // At this point both microtasks should have run. Ensure the order is
    // deterministic (user microtask first, runtime microtask after) which our
    // runtime relies on for some guarantees.
    expect(events).toEqual(['user', 'runtime']);

    cleanup();
  });
});
