import { describe, expect, it } from 'vite-plus/test';
import {
  createSingleNodeRange,
  getOwnedRange,
  getRangeOwner,
  registerRange,
} from '../../../src/renderer/dom-range';

describe('dom-range ownership reassignment (regression for #357)', () => {
  it('should release the previous owner\'s registration when a shared anchor node is re-registered under a new owner', () => {
    const node = document.createElement('div');
    const previousOwner = {};
    const nextOwner = {};

    const firstRange = createSingleNodeRange(node, previousOwner);
    expect(getOwnedRange(previousOwner)).toBe(firstRange);
    expect(getRangeOwner(node)).toBe(previousOwner);

    // A new range object sharing the same start/end anchor node gets
    // registered under a different owner (e.g. re-parented control).
    const secondRange = { start: node, end: node, single: true } as const;
    registerRange(secondRange, nextOwner);

    // The anchor now belongs to the new owner...
    expect(getRangeOwner(node)).toBe(nextOwner);
    expect(getOwnedRange(nextOwner)).toEqual(secondRange);

    // ...and critically, the previous owner's stale registration must be
    // released, not left pointing at a range whose anchor it no longer owns.
    expect(getOwnedRange(previousOwner)).toBeUndefined();
  });

  it('should NOT release an unrelated owner\'s range that happens to occupy the same WeakMap chain but shares no anchor node', () => {
    const nodeA = document.createElement('div');
    const nodeB = document.createElement('span');
    const ownerA = {};
    const ownerB = {};

    const rangeA = createSingleNodeRange(nodeA, ownerA);
    const rangeB = createSingleNodeRange(nodeB, ownerB);

    // Re-registering ownerB's own range again should never disturb ownerA,
    // since they share no start/end anchor.
    registerRange(rangeB, ownerB);

    expect(getOwnedRange(ownerA)).toBe(rangeA);
    expect(getOwnedRange(ownerB)).toBe(rangeB);
  });
});
