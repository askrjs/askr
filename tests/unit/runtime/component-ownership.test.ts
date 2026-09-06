import { describe, expect, it } from 'vite-plus/test';
import { createComponentInstance } from '../../../src/runtime/component/instance';
import { cleanupComponent } from '../../../src/runtime/component/cleanup';
import { setCurrentComponentInstance } from '../../../src/runtime/component/scope';
import {
  attachOwnership,
  getOwnershipSignal,
  ownCleanup,
} from '../../../src/runtime/ownership/record';

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
      root.owner
    );
    const retained = createComponentInstance(
      'retained',
      () => null,
      {},
      null,
      root.owner
    );
    const signal = getOwnershipSignal(retained.owner);
    let cleaned = 0;
    ownCleanup(first.owner, () =>
      attachOwnership(retained.owner, replacement.owner)
    );
    ownCleanup(retained.owner, () => {
      cleaned++;
    });
    cleanupComponent(root);
    expect(signal.aborted).toBe(false);
    expect(retained.owner.parent).toBe(replacement.owner);
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
      root.owner
    );
    expect(() => attachOwnership(root.owner, child.owner)).toThrow('cycle');
    expect(root.owner.parent).toBeUndefined();
    expect(child.owner.parent).toBe(root.owner);
    cleanupComponent(root);
    expect(child.owner.disposed).toBe(true);
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
    const childSignal = getOwnershipSignal(child.owner);
    const siblingSignal = getOwnershipSignal(sibling.owner);
    ownCleanup(child.owner, () => {
      calls.push('child');
      throw new Error('child cleanup failed');
    });
    ownCleanup(child.owner, () => {
      calls.push('child remainder');
    });
    ownCleanup(sibling.owner, () => {
      calls.push('sibling');
    });
    ownCleanup(root.owner, () => {
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
    ownCleanup(root.owner, () => {
      cleaned++;
    });
    try {
      for (let index = 0; index < 10_000; index++) {
        setCurrentComponentInstance(parent);
        parent = createComponentInstance(String(index), () => null, {}, null);
        ownCleanup(parent.owner, () => {
          cleaned++;
        });
      }
    } finally {
      setCurrentComponentInstance(null);
    }
    expect(() => cleanupComponent(root)).not.toThrow();
    expect(cleaned).toBe(10_001);
    expect(getOwnershipSignal(parent.owner).aborted).toBe(true);
  });
});
