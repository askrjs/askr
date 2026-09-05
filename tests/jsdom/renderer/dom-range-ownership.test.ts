import { describe, expect, it } from 'vite-plus/test';
import {
  createComponentInstance,
  getCurrentInstance,
  mountInstanceInline,
  type ComponentInstance,
} from '../../../src/runtime';
import { render } from '../../../src/testing';
import { jsx } from '../../../src/jsx-runtime';
import { writeHostOwners } from '../../../src/renderer/dom-ownership';
import { evaluate } from '../../../src/renderer/evaluate';
import { detachPortalHostOutput } from '../../../src/renderer/portal-host';
import { captureComponentGeneration } from '../../../src/runtime/component-generation';
import {
  createSingleNodeRange,
  clearRangeOwner,
  getOwnedRange,
  getRangeOwner,
  registerRange,
  releaseOwnerRange,
} from '../../../src/renderer/dom-range';
import { createChildScope } from '../../../src/runtime/child-scope';
import { writeScopeHost } from '../../../src/renderer/scope-host';
import {
  clearDOMRange,
  createDOMRange,
  updateDOMRangeForContext,
} from '../../../src/renderer/evaluate-dom-range';

describe('dom-range ownership reassignment (regression for #357)', () => {
  it('should restore the range index after a provisional generation is discarded', () => {
    const host = document.createElement('div');
    const owner = createComponentInstance('generation', () => null, {}, host);
    mountInstanceInline(owner, host);
    const previous = getOwnedRange(owner);
    const generation = captureComponentGeneration(owner);
    generation.prepare(() => null, {});
    const replacement = document.createElement('span');
    mountInstanceInline(owner, replacement);
    expect(getOwnedRange(owner)?.start).toBe(replacement);
    generation.rollback(() => {
      writeHostOwners(host, [owner], owner);
      return [];
    });
    expect(owner.target).toBe(host);
    expect(getOwnedRange(owner)).toBe(previous);
    releaseOwnerRange(owner);
  });

  it('should move the range index when evaluation replaces an intrinsic host', () => {
    const parent = document.createElement('main');
    const host = document.createElement('div');
    parent.appendChild(host);
    const owner = createComponentInstance('replace', () => null, {}, host);
    mountInstanceInline(owner, host);
    expect(getOwnedRange(owner)?.start).toBe(host);
    evaluate(jsx('span', { children: 'replacement' }), host, undefined, owner);
    expect(owner.target).toBe(parent.firstChild);
    expect(getOwnedRange(owner)?.start).toBe(parent.firstChild);
    releaseOwnerRange(owner);
  });

  it('should move a detached portal host index to its live placeholder', () => {
    const parent = document.createElement('main');
    const host = document.createElement('div');
    parent.appendChild(host);
    const owner = createComponentInstance('portal', () => null, {}, host);
    mountInstanceInline(owner, host);
    expect(getOwnedRange(owner)?.start).toBe(host);
    detachPortalHostOutput(owner);
    expect(owner._placeholder).toBe(parent.firstChild);
    expect(getOwnedRange(owner)?.start).toBe(parent.firstChild);
    releaseOwnerRange(owner);
  });

  it('should keep a scope host and its owned range on the same registration', () => {
    const scope = createChildScope(null, 'scope');
    const previous = createSingleNodeRange(
      document.createElement('div'),
      scope
    );
    writeScopeHost(scope, previous);
    const next = createSingleNodeRange(document.createElement('span'));
    writeScopeHost(scope, next);
    expect(getOwnedRange(scope)).toBe(next);
    expect(getRangeOwner(previous.start)).toBeUndefined();
    releaseOwnerRange(scope);
    expect(getOwnedRange(scope)).toBeUndefined();
    expect(scope.range).toBeUndefined();
    scope.dispose();
  });

  it('should register extension context anchors without mutating the context', () => {
    const context = Object.freeze({ range: 'consumer-owned' });
    const host = document.createElement('div');
    createDOMRange(host, context, 'initial');
    const start = host.firstChild!;
    const end = host.lastChild!;
    const owner = getRangeOwner(start)!;
    expect(owner).toBeDefined();
    expect(getOwnedRange(owner)).toEqual({ start, end, single: false });
    updateDOMRangeForContext(host, context, ['updated']);
    expect(host.textContent).toBe('updated');
    expect(context.range).toBe('consumer-owned');
    clearDOMRange(context);
    expect(getRangeOwner(start)).toBeUndefined();
    expect(getRangeOwner(end)).toBeUndefined();
    expect(getOwnedRange(owner)).toBeUndefined();
  });

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
