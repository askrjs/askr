import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { cleanupApp, createSPA } from '../../../src/boot';
import { task } from '../../../src/runtime/operations';
import { getSignal } from '../../../src/resources';
import { navigate } from '../../../src/router/navigate';
import { routeRegistryFromTable } from '../../router-test-utils';
import {
  beginCommitTransaction,
  commitTransaction,
  discardTransaction,
} from '../../../src/runtime/transaction-access';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('navigation during lifecycle settlement', () => {
  let view: ReturnType<typeof createTestContainer>;
  beforeEach(() => {
    view = createTestContainer();
    window.history.replaceState({}, '', '/first');
  });
  afterEach(() => {
    cleanupApp(view.container);
    view.cleanup();
    window.history.replaceState({}, '', '/');
  });

  it.each(['commit', 'discard'] as const)(
    'should defer nested navigation publication until the enclosing transaction can %s',
    async (outcome) => {
      const calls: string[] = [];
      let firstSignal!: AbortSignal;
      await createSPA({
        root: view.container,
        registry: routeRegistryFromTable([
          {
            path: '/first',
            handler: () => {
              firstSignal = getSignal();
              task(() => () => {
                calls.push('first cleanup');
              });
              return <p>{'first'}</p>;
            },
          },
          {
            path: '/second',
            handler: () => {
              task(() => {
                calls.push(`second task:${window.location.pathname}`);
              });
              return <p>{'second'}</p>;
            },
          },
        ]),
      });
      await Promise.resolve();
      await Promise.resolve();
      const transaction = beginCommitTransaction();
      try {
        navigate('/second');
        flushScheduler();
        expect(calls).toEqual([]);
        expect(firstSignal.aborted).toBe(false);
        expect(window.location.pathname).toBe('/first');
        if (outcome === 'commit') commitTransaction(transaction);
        else discardTransaction(transaction);
      } finally {
        discardTransaction(transaction);
      }
      expect(view.container.textContent).toBe(
        outcome === 'commit' ? 'second' : 'first'
      );
      expect(window.location.pathname).toBe(
        outcome === 'commit' ? '/second' : '/first'
      );
      expect(firstSignal.aborted).toBe(outcome === 'commit');
      expect(calls).toEqual(
        outcome === 'commit' ? ['first cleanup', 'second task:/first'] : []
      );
    }
  );

  it.each(['push', 'popstate'] as const)(
    'should preserve a newer navigation and retire every departed lifetime after %s settlement',
    async (mode) => {
      let firstSignal!: AbortSignal;
      let lastSignal!: AbortSignal;
      let firstCleanup = 0;
      await createSPA({
        root: view.container,
        registry: routeRegistryFromTable([
          {
            path: '/first',
            handler: () => {
              firstSignal = getSignal();
              task(() => () => {
                firstCleanup++;
              });
              return <p>{'first'}</p>;
            },
          },
          {
            path: '/middle',
            handler: () => {
              task(() => {
                navigate('/last', { state: { destination: 'last' } });
              });
              return <p>{'middle'}</p>;
            },
          },
          {
            path: '/last',
            handler: () => {
              lastSignal = getSignal();
              return <p>{'last'}</p>;
            },
          },
        ]),
      });
      await Promise.resolve();
      await Promise.resolve();
      if (mode === 'push') navigate('/middle');
      else {
        window.history.pushState({ path: '/middle' }, '', '/middle');
        window.dispatchEvent(
          new PopStateEvent('popstate', { state: { path: '/middle' } })
        );
      }
      for (let index = 0; index < 3; index++) {
        await Promise.resolve();
        flushScheduler();
      }
      expect(window.location.pathname).toBe('/last');
      expect(view.container.textContent).toBe('last');
      expect(window.history.state.askrState).toEqual({ destination: 'last' });
      expect(firstSignal.aborted).toBe(true);
      expect(firstCleanup).toBe(1);
      const retainedSignal = lastSignal;
      navigate('/last?refresh=1');
      for (let index = 0; index < 3; index++) {
        await Promise.resolve();
        flushScheduler();
      }
      expect(lastSignal).toBe(retainedSignal);
      expect(retainedSignal.aborted).toBe(false);
      expect(view.container.textContent).toBe('last');
    }
  );
});
