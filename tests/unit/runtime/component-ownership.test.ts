import { describe, expect, it } from 'vite-plus/test';
import { createComponentInstance } from '../../../src/runtime/component-internal';
import { cleanupComponent } from '../../../src/runtime/component-cleanup';
import { setCurrentComponentInstance } from '../../../src/runtime/component-scope';
import {
  attachOwnership,
  getOwnershipSignal,
  ownCleanup,
} from '../../../src/runtime/ownership';

describe('component lifetime ownership', () => {
  it('should preserve a child adopted by another lifetime during sibling cleanup', () => {
    const root = createComponentInstance('root', () => null, {}, null);
    const replacement = createComponentInstance(
      'replacement',
      () => null,
      {},
      null
    );
    const first = createComponentInstance(
      'first',
      () => null,
      {},
      null,
      root.ownership
    );
    const retained = createComponentInstance(
      'retained',
      () => null,
      {},
      null,
      root.ownership
    );
    const signal = getOwnershipSignal(retained.ownership);
    let cleaned = 0;
    ownCleanup(first.ownership, () =>
      attachOwnership(retained.ownership, replacement.ownership)
    );
    ownCleanup(retained.ownership, () => {
      cleaned++;
    });
    cleanupComponent(root);
    expect(signal.aborted).toBe(false);
    expect(retained.ownership.parent).toBe(replacement.ownership);
    cleanupComponent(replacement);
    expect(signal.aborted).toBe(true);
    expect(cleaned).toBe(1);
  });

  it('should reject an ownership cycle without changing either lifetime', () => {
    const root = createComponentInstance('root', () => null, {}, null);
    const child = createComponentInstance(
      'child',
      () => null,
      {},
      null,
      root.ownership
    );
    expect(() => attachOwnership(root.ownership, child.ownership)).toThrow(
      'cycle'
    );
    expect(root.ownership.parent).toBeUndefined();
    expect(child.ownership.parent).toBe(root.ownership);
    cleanupComponent(root);
    expect(child.ownership.disposed).toBe(true);
  });

  it('should drain descendants before parent cleanup despite an individual failure', () => {
    const calls: string[] = [];
    const root = createComponentInstance('root', () => null, {}, null);
    root.cleanupStrict = true;
    let child: ReturnType<typeof createComponentInstance>;
    let sibling: ReturnType<typeof createComponentInstance>;
    try {
      setCurrentComponentInstance(root);
      child = createComponentInstance('child', () => null, {}, null);
      sibling = createComponentInstance('sibling', () => null, {}, null);
    } finally {
      setCurrentComponentInstance(null);
    }
    child.cleanupStrict = true;
    sibling.cleanupStrict = true;
    const childSignal = getOwnershipSignal(child.ownership);
    const siblingSignal = getOwnershipSignal(sibling.ownership);
    ownCleanup(child.ownership, () => {
      calls.push('child');
      throw new Error('child cleanup failed');
    });
    ownCleanup(child.ownership, () => {
      calls.push('child remainder');
    });
    ownCleanup(sibling.ownership, () => {
      calls.push('sibling');
    });
    ownCleanup(root.ownership, () => {
      calls.push('root');
    });
    expect(() => cleanupComponent(root)).toThrow('Cleanup failed');
    expect(calls).toEqual(['child', 'child remainder', 'sibling', 'root']);
    expect(childSignal.aborted).toBe(true);
    expect(siblingSignal.aborted).toBe(true);
    cleanupComponent(root);
    expect(calls).toHaveLength(4);
  });

  it('should dispose a ten-thousand-component chain without recursive stack growth', () => {
    const root = createComponentInstance('root', () => null, {}, null);
    let parent = root;
    let cleaned = 0;
    ownCleanup(root.ownership, () => {
      cleaned++;
    });
    try {
      for (let index = 0; index < 10_000; index++) {
        setCurrentComponentInstance(parent);
        parent = createComponentInstance(String(index), () => null, {}, null);
        ownCleanup(parent.ownership, () => {
          cleaned++;
        });
      }
    } finally {
      setCurrentComponentInstance(null);
    }
    expect(() => cleanupComponent(root)).not.toThrow();
    expect(cleaned).toBe(10_001);
    expect(getOwnershipSignal(parent.ownership).aborted).toBe(true);
  });
});
