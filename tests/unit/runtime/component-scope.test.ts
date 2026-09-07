/**
 * Component scope entry and restoration.
 *
 * The first block pins `withComponentScope` / `beginComponentScope` /
 * `endComponentScope`: whatever the entry changes, restoration returns all
 * three ambient fields.
 *
 * The second block characterises the older enter/exit pairs as they behave
 * today, asymmetries included. Those assertions describe current behaviour, not
 * desired behaviour; the step that migrates callers onto the primitive is what
 * changes them, and these cases are the record of what it changed.
 */

import { describe, expect, it } from 'vite-plus/test';
import {
  beginComponentScope,
  endComponentScope,
  enterComponentExecutionScope,
  enterDomCommitScope,
  exitComponentExecutionScope,
  getCurrentComponentInstance,
  getCurrentStateIndex,
  restoreDomCommitScope,
  setStateIndex,
  withComponentScope,
  type ComponentScopeSnapshot,
} from '../../../src/runtime/component/scope';
import type { ComponentInstance } from '../../../src/runtime';

function fakeInstance(portalScope: object | null = null): ComponentInstance {
  return { portalScope } as unknown as ComponentInstance;
}

function currentScope(): ComponentScopeSnapshot {
  const snapshot = beginComponentScope({});
  endComponentScope(snapshot);
  return snapshot;
}

describe('component scope primitive (RUNTIME)', () => {
  it('should restore every field after an entry that changed one', () => {
    const outer = fakeInstance();
    const inner = fakeInstance();
    const before = beginComponentScope({ instance: outer, stateIndex: 7 });

    withComponentScope({ instance: inner, stateIndex: 0 }, () => {
      expect(getCurrentComponentInstance()).toBe(inner);
      expect(getCurrentStateIndex()).toBe(0);
    });

    expect(getCurrentComponentInstance()).toBe(outer);
    expect(getCurrentStateIndex()).toBe(7);
    endComponentScope(before);
  });

  it('should restore the hook cursor even when entry did not set it', () => {
    const before = beginComponentScope({ stateIndex: 3 });

    withComponentScope({ instance: fakeInstance() }, () => {
      setStateIndex(99);
    });

    // The entry named only `instance`, but restoration still owns all three.
    expect(getCurrentStateIndex()).toBe(3);
    endComponentScope(before);
  });

  it('should restore the previous scope when the body throws', () => {
    const outer = fakeInstance();
    const before = beginComponentScope({ instance: outer, stateIndex: 2 });

    expect(() =>
      withComponentScope({ instance: fakeInstance(), stateIndex: 0 }, () => {
        throw new Error('boom');
      })
    ).toThrow('boom');

    expect(getCurrentComponentInstance()).toBe(outer);
    expect(getCurrentStateIndex()).toBe(2);
    endComponentScope(before);
  });

  it('should adopt the entered instance portal scope by default', () => {
    const portalScope = {};
    const before = beginComponentScope({});

    withComponentScope({ instance: fakeInstance(portalScope) }, () => {
      expect(currentScope().portalScope).toBe(portalScope);
    });

    endComponentScope(before);
  });
});

describe('legacy component scope pairs, as they behave today (RUNTIME)', () => {
  it('should leave the hook cursor advanced after a DOM commit scope', () => {
    const before = beginComponentScope({ instance: fakeInstance() });
    setStateIndex(5);

    const previous = enterDomCommitScope(fakeInstance());
    setStateIndex(11);
    restoreDomCommitScope(previous);

    // enterDomCommitScope saves only `currentInstance`, so the cursor stays
    // where the inner scope left it.
    expect(getCurrentStateIndex()).toBe(11);
    endComponentScope(before);
  });

  it('should clear the current instance when leaving an execution scope', () => {
    const outer = fakeInstance();
    const before = beginComponentScope({ instance: outer });

    const savedPortalScope = enterComponentExecutionScope(fakeInstance());
    exitComponentExecutionScope(savedPortalScope);

    // The outer instance is not restored; the scope is nulled instead.
    expect(getCurrentComponentInstance()).toBeNull();
    endComponentScope(before);
  });
});
