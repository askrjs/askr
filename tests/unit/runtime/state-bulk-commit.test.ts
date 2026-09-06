import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createChildScope } from '../../../src/runtime/ownership/child-scope';
import {
  cleanupComponent,
  createComponentInstance,
} from '../../../src/runtime';
import {
  beginCommitTransaction,
  commitTransaction,
  getCurrentCommitTransaction,
} from '../../../src/runtime/transactions/access';
import { state, type State } from '../../../src/runtime/reactivity/state';
import * as readable from '../../../src/runtime/reactivity/readable';

describe('state.set() during an active transaction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should defer reader notifications until the transaction exits', () => {
    const parent = createComponentInstance('parent', () => null, {}, null);
    const scope = createChildScope(parent, 'cell');
    let counter!: State<number>;
    scope.render(() => {
      const [get] = state(0);
      counter = get;
      return counter();
    });

    const notifySpy = vi.spyOn(readable, 'notifyReadableReaders');
    const markDerivedSpy = vi.spyOn(
      readable,
      'markReadableDerivedSubscribersDirty'
    );
    const markPropsSpy = vi.spyOn(readable, 'markReactivePropsDirtySource');

    const transaction1 = beginCommitTransaction();
    transaction1.setDeferredNotifications(true);
    try {
      counter.set(1);
      counter.set(2);

      expect(counter()).toBe(2);
      expect(notifySpy).not.toHaveBeenCalled();
      expect(markDerivedSpy).not.toHaveBeenCalled();
      expect(markPropsSpy).not.toHaveBeenCalled();
    } finally {
      commitTransaction(transaction1);
    }

    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(markDerivedSpy).toHaveBeenCalledTimes(1);
    expect(markPropsSpy).toHaveBeenCalledTimes(1);

    cleanupComponent(parent);
  });

  it.each(['development', 'production'] as const)(
    'should replay transaction writes in %s mode',
    (environment) => {
      const previousEnvironment = process.env.NODE_ENV;
      process.env.NODE_ENV = environment;
      const parent = createComponentInstance('parent', () => null, {}, null);
      const scope = createChildScope(parent, 'cell');
      let counter!: State<number>;
      scope.render(() => {
        const [get] = state(0);
        counter = get;
        return counter();
      });
      const notifySpy = vi.spyOn(readable, 'notifyReadableReaders');

      try {
        const transaction2 = beginCommitTransaction();
        transaction2.setDeferredNotifications(true);
        try {
          counter.set(1);
          expect(notifySpy).not.toHaveBeenCalled();
        } finally {
          commitTransaction(transaction2);
        }

        expect(counter()).toBe(1);
        expect(notifySpy).toHaveBeenCalledTimes(1);
      } finally {
        if (previousEnvironment === undefined) {
          delete process.env.NODE_ENV;
        } else {
          process.env.NODE_ENV = previousEnvironment;
        }
        cleanupComponent(parent);
      }
    }
  );

  it('should not defer a notification for a no-op set', () => {
    const parent = createComponentInstance('parent', () => null, {}, null);
    const scope = createChildScope(parent, 'cell');
    let counter!: State<number>;
    scope.render(() => {
      const [get] = state(0);
      counter = get;
      return counter();
    });

    const notifySpy = vi.spyOn(readable, 'notifyReadableReaders');

    const transaction3 = beginCommitTransaction();
    transaction3.setDeferredNotifications(true);
    try {
      counter.set(0);
    } finally {
      commitTransaction(transaction3);
    }

    expect(notifySpy).not.toHaveBeenCalled();

    cleanupComponent(parent);
  });

  it('should retain deferred writes until the outermost transaction exits', () => {
    const parent = createComponentInstance('parent', () => null, {}, null);
    const scope = createChildScope(parent, 'cell');
    let outerCounter!: State<number>;
    let innerCounter!: State<number>;
    scope.render(() => {
      const [getOuter] = state(0);
      const [getInner] = state(0);
      outerCounter = getOuter;
      innerCounter = getInner;
      return outerCounter() + innerCounter();
    });

    const notifySpy = vi.spyOn(readable, 'notifyReadableReaders');

    const transaction4 = beginCommitTransaction();
    transaction4.setDeferredNotifications(true);
    try {
      outerCounter.set(1);
      const transaction5 = beginCommitTransaction();
      transaction5.setDeferredNotifications(true);
      try {
        innerCounter.set(1);
      } finally {
        commitTransaction(transaction5);
      }

      expect(getCurrentCommitTransaction() !== null).toBe(true);
      expect(notifySpy).not.toHaveBeenCalled();
      outerCounter.set(2);
    } finally {
      commitTransaction(transaction4);
    }

    expect(getCurrentCommitTransaction() !== null).toBe(false);
    expect(notifySpy).toHaveBeenCalledTimes(2);

    cleanupComponent(parent);
  });
});
