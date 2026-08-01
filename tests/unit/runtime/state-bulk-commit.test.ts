import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createChildScope } from '../../../src/runtime/child-scope';
import {
  cleanupComponent,
  createComponentInstance,
} from '../../../src/runtime/component';
import { enterBulkCommit, exitBulkCommit } from '../../../src/runtime/fastlane';
import { state, type State } from '../../../src/runtime/state';
import * as readable from '../../../src/runtime/readable';
import { logger } from '../../../src/common/logger';

describe('state.set() during an active bulk commit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should update the backing value without notifying readers', () => {
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
    } finally {
      exitBulkCommit();
    }

    // The value itself must still update (bulk-commit reads later in the
    // same commit still need to see the new value)...
    expect(counter()).toBe(1);
    // ...but per the documented "must be side-effect free" contract of a
    // bulk commit, no reader notification path runs.
    expect(notifySpy).not.toHaveBeenCalled();
    expect(markDerivedSpy).not.toHaveBeenCalled();
    expect(markPropsSpy).not.toHaveBeenCalled();

    cleanupComponent(parent);
  });

  it('should warn in dev that the update will not be reactively observed', () => {
    const parent = createComponentInstance('parent', () => null, {}, null);
    const scope = createChildScope(parent, 'cell');
    let counter!: State<number>;
    scope.render(() => {
      const [get] = state(0);
      counter = get;
      return counter();
    });

    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    enterBulkCommit();
    try {
      counter.set(1);
    } finally {
      exitBulkCommit();
    }

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/bulk commit/i);

    cleanupComponent(parent);
  });

  it('should not warn for a no-op set (value unchanged)', () => {
    const parent = createComponentInstance('parent', () => null, {}, null);
    const scope = createChildScope(parent, 'cell');
    let counter!: State<number>;
    scope.render(() => {
      const [get] = state(0);
      counter = get;
      return counter();
    });

    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    enterBulkCommit();
    try {
      counter.set(0);
    } finally {
      exitBulkCommit();
    }

    expect(warnSpy).not.toHaveBeenCalled();

    cleanupComponent(parent);
  });
});
