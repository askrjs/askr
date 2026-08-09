import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createChildScope } from '../../../src/runtime/child-scope';
import {
  cleanupComponent,
  createComponentInstance,
} from '../../../src/runtime/component';
import {
  enterBulkCommit,
  exitBulkCommit,
  isBulkCommitActive,
} from '../../../src/runtime/fastlane';
import { state, type State } from '../../../src/runtime/state';
import * as readable from '../../../src/runtime/readable';

describe('state.set() during an active bulk commit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should defer reader notifications until the bulk commit exits', () => {
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

    enterBulkCommit();
    try {
      counter.set(1);
      counter.set(2);

      expect(counter()).toBe(2);
      expect(notifySpy).not.toHaveBeenCalled();
      expect(markDerivedSpy).not.toHaveBeenCalled();
      expect(markPropsSpy).not.toHaveBeenCalled();
    } finally {
      exitBulkCommit();
    }

    expect(notifySpy).toHaveBeenCalledTimes(1);
    expect(markDerivedSpy).toHaveBeenCalledTimes(1);
    expect(markPropsSpy).toHaveBeenCalledTimes(1);

    cleanupComponent(parent);
  });

  it.each(['development', 'production'] as const)(
    'should replay bulk-commit writes in %s mode',
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
        enterBulkCommit();
        try {
          counter.set(1);
          expect(notifySpy).not.toHaveBeenCalled();
        } finally {
          exitBulkCommit();
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

    enterBulkCommit();
    try {
      counter.set(0);
    } finally {
      exitBulkCommit();
    }

    expect(notifySpy).not.toHaveBeenCalled();

    cleanupComponent(parent);
  });

  it('should retain deferred writes until the outermost bulk commit exits', () => {
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

    enterBulkCommit();
    try {
      outerCounter.set(1);
      enterBulkCommit();
      try {
        innerCounter.set(1);
      } finally {
        exitBulkCommit();
      }

      expect(isBulkCommitActive()).toBe(true);
      expect(notifySpy).not.toHaveBeenCalled();
      outerCounter.set(2);
    } finally {
      exitBulkCommit();
    }

    expect(isBulkCommitActive()).toBe(false);
    expect(notifySpy).toHaveBeenCalledTimes(2);

    cleanupComponent(parent);
  });
});
