import { afterEach, describe, expect, it } from 'vite-plus/test';
import { Computation, Signal } from '../../../src/core/reactive/graph';
import {
  clearScheduler,
  effectScheduler,
  flushSync,
} from '../../../src/core/reactive/scheduler';

describe('computation debug names', () => {
  afterEach(() => clearScheduler());

  it('should name a computation in the circular dependency error', () => {
    const named = new Computation<number>(null, () => named.read(), null);
    named.name = 'total';
    expect(() => named.read()).toThrow(
      'Circular reactive dependency detected in "total".'
    );
    const anonymous = new Computation<number>(
      null,
      () => anonymous.read(),
      null
    );
    expect(() => anonymous.read()).toThrow(
      'Circular reactive dependency detected.'
    );
  });

  it('should name a looping computation in the flush loop-guard error', () => {
    const source = new Signal(0);
    const effect = new Computation<void>(
      null,
      () => {
        source.write(source.read() + 1);
      },
      effectScheduler('effect'),
      null
    );
    effect.name = 'ticker';
    effect.update();
    expect(() => flushSync()).toThrow(
      /exceeded MAX_FLUSH_DEPTH \(50\).*"ticker"/
    );
  });
});
