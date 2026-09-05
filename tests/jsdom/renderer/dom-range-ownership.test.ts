import { describe, expect, it } from 'vite-plus/test';
import {
  createComponentInstance,
  getCurrentInstance,
  type ComponentInstance,
} from '../../../src/runtime';
import { render } from '../../../src/testing';
import { jsx } from '../../../src/jsx-runtime';
import { writeHostOwners } from '../../../src/renderer/dom-ownership';
import {
  createSingleNodeRange,
  clearRangeOwner,
  getOwnedRange,
  getRangeOwner,
  registerRange,
} from '../../../src/renderer/dom-range';

describe('dom-range ownership reassignment (regression for #357)', () => {
  it('should refresh shared owner indexes when the same anchors receive a new range', () => {
    const outer = createComponentInstance('outer', () => null, {}, null);
    const inner = createComponentInstance('inner', () => null, {}, null);
    const host = document.createElement('div');
    writeHostOwners(host, [outer, inner], outer);
    const previous = createSingleNodeRange(host, outer);
    expect(getOwnedRange(inner)).toBe(previous);
    const next = createSingleNodeRange(host, inner);
    expect(getOwnedRange(outer)).toBe(next);
    expect(getOwnedRange(inner)).toBe(next);
    clearRangeOwner(previous, outer);
    expect(getOwnedRange(outer)).toBe(next);
    writeHostOwners(host, [inner], inner);
    expect(getOwnedRange(outer)).toBeUndefined();
    expect(getRangeOwner(host)).toBe(inner);
  });

  it('should release disposed component indexes and reject stale host publication', () => {
    let owner!: ComponentInstance;
    function Child() {
      owner = getCurrentInstance()!;
      return jsx('span', { children: 'owned' });
    }
    const view = render(() => jsx(Child, {}));
    try {
      const host = view.root.querySelector('span')!;
      expect(getOwnedRange(owner)?.start).toBe(host);
      view.unmount();
      expect(getOwnedRange(owner)).toBeUndefined();
      writeHostOwners(host, [owner], owner);
      expect(getOwnedRange(owner)).toBeUndefined();
    } finally {
      view.cleanup();
    }
  });

  it('should resolve shared wrapper owners to one range and retire only the departed host index', () => {
    const outer = createComponentInstance('outer', () => null, {}, null);
    const inner = createComponentInstance('inner', () => null, {}, null);
    const host = document.createElement('div');
    writeHostOwners(host, [outer, inner], outer);
    const range = getOwnedRange(outer);
    expect(range).toBeDefined();
    expect(getOwnedRange(inner)).toBe(range);
    expect(range?.start).toBe(host);

    const replacement = document.createElement('span');
    writeHostOwners(replacement, [outer], outer);
    writeHostOwners(host, [inner], inner);
    expect(getOwnedRange(outer)?.start).toBe(replacement);
    expect(getOwnedRange(inner)).toBe(range);
    writeHostOwners(host, undefined, undefined);
    expect(getOwnedRange(inner)).toBeUndefined();
    expect(getOwnedRange(outer)?.start).toBe(replacement);
  });

  it('should remove old anchor indexes when an owner moves to another range', () => {
    const owner = {};
    const previous = createSingleNodeRange(
      document.createElement('div'),
      owner
    );
    const next = createSingleNodeRange(document.createElement('span'), owner);
    expect(getOwnedRange(owner)).toBe(next);
    expect(getRangeOwner(previous.start)).toBeUndefined();
    expect(getRangeOwner(next.start)).toBe(owner);
  });

  it('should preserve a replacement registration when an obsolete range is cleared', () => {
    const node = document.createElement('div');
    const previous = createSingleNodeRange(node, {});
    const nextOwner = {};
    const next = createSingleNodeRange(node, nextOwner);
    clearRangeOwner(previous);
    expect(getRangeOwner(node)).toBe(nextOwner);
    expect(getOwnedRange(nextOwner)).toBe(next);
  });

  it("should release the previous owner's registration when a shared anchor node is re-registered under a new owner", () => {
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

  it("should NOT release an unrelated owner's range that happens to occupy the same WeakMap chain but shares no anchor node", () => {
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
