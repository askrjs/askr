import { bench, describe } from 'vitest';
import { composeHandlers } from '../../src/foundations/utilities/composeHandlers';

describe('composeHandlers (FOUNDATIONS)', () => {
  const noop = (_event?: unknown) => {};
  const handlerWithPrevent = (e: { preventDefault?: () => void }) => {
    e.preventDefault?.();
  };

  // Mock event objects
  const simpleEvent = { type: 'click' };
  const eventWithPrevent = {
    type: 'click',
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  const eventAlreadyPrevented = {
    type: 'click',
    defaultPrevented: true,
    preventDefault() {},
  };

  bench('compose two simple handlers', () => {
    const composed = composeHandlers(noop, noop);
    composed(simpleEvent);
  });

  bench('compose with first handler only', () => {
    const composed = composeHandlers(noop, undefined);
    composed(simpleEvent);
  });

  bench('compose with second handler only', () => {
    const composed = composeHandlers(undefined, noop);
    composed(simpleEvent);
  });

  bench('compose both undefined', () => {
    const composed = composeHandlers(undefined, undefined);
    composed(simpleEvent);
  });

  bench('compose with preventDefault check (default)', () => {
    const composed = composeHandlers(handlerWithPrevent, noop);
    composed(eventWithPrevent);
  });

  bench('compose without preventDefault check', () => {
    const composed = composeHandlers(handlerWithPrevent, noop, {
      checkDefaultPrevented: false,
    });
    composed(eventWithPrevent);
  });

  bench('compose with already prevented event', () => {
    const composed = composeHandlers(noop, noop);
    composed(eventAlreadyPrevented);
  });

  // Realistic scenarios
  bench('realistic: onClick composition', () => {
    let _clicks = 0;
    const userHandler = (_event?: unknown) => {
      _clicks++;
    };
    const internalHandler = (_event?: unknown) => {
      _clicks++;
    };
    const composed = composeHandlers(userHandler, internalHandler);
    composed({ type: 'click' });
  });

  bench('realistic: preventDefault pattern', () => {
    let _prevented = false;
    const userHandler = (e: { preventDefault?: () => void }) => {
      e.preventDefault?.();
      _prevented = true;
    };
    const internalHandler = () => {
      _prevented = false;
    };
    const composed = composeHandlers(userHandler, internalHandler);
    composed(eventWithPrevent);
  });

  // Stress test: handler chain creation overhead
  bench('create handler chain (no execution)', () => {
    composeHandlers(noop, noop);
  });

  bench('create and execute handler chain', () => {
    const composed = composeHandlers(noop, noop);
    composed(simpleEvent);
  });

  // Multiple args scenario
  bench('compose with multiple arguments', () => {
    const handler1 = (_a: number, _b: string, _c: boolean) => {};
    const handler2 = (_a: number, _b: string, _c: boolean) => {};
    const composed = composeHandlers(handler1, handler2);
    composed(1, 'test', true);
  });
});
