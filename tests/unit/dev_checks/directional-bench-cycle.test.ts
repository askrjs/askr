import { describe, expect, it } from 'vite-plus/test';
import { createDirectionalBenchCycle } from '../../../benches/shared/_shared';

describe('directional benchmark cycle', () => {
  it('should reset after the timed mutation and before the next sample', async () => {
    let state = 'initial';
    const events: string[] = [];
    const cycle = createDirectionalBenchCycle({
      label: 'contract',
      verifyInitial: () => expect(state).toBe('initial'),
      forward: () => {
        events.push('forward');
        state = 'forward';
      },
      reset: () => {
        events.push('reset');
        state = 'initial';
      },
    });

    cycle.runForward();
    expect(events).toEqual(['forward']);
    expect(state).toBe('forward');

    await Promise.resolve();
    expect(events).toEqual(['forward', 'reset']);
    expect(state).toBe('initial');

    cycle.runForward();
    await Promise.resolve();
    cycle.teardown();
  });

  it('should surface reset failures on the next invocation and teardown', async () => {
    const createFailingCycle = () =>
      createDirectionalBenchCycle({
        label: 'failure contract',
        verifyInitial: () => undefined,
        forward: () => undefined,
        reset: () => {
          throw new Error('reset failed');
        },
      });

    const nextCycle = createFailingCycle();
    nextCycle.runForward();
    await Promise.resolve();
    expect(() => nextCycle.runForward()).toThrow('reset failed');

    const teardownCycle = createFailingCycle();
    teardownCycle.runForward();
    await Promise.resolve();
    expect(() => teardownCycle.teardown()).toThrow('reset failed');
  });
});
