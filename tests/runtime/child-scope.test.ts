import { describe, it, expect } from 'vite-plus/test';
import { createChildScope } from '../../src/runtime/child-scope';
import {
  cleanupComponent,
  createComponentInstance,
  renderScopedComponent,
} from '../../src/runtime/component';
import type { ReadableSource } from '../../src/runtime/readable';
import { state, type State } from '../../src/runtime/state';

type ReaderTracked = {
  _readers?: Map<unknown, unknown>;
};

describe('child scope runtime', () => {
  it('should dispose child scopes with their parent and reject rendering disposed scopes', () => {
    const parent = createComponentInstance('parent', () => null, {}, null);
    let shared!: State<number>;

    renderScopedComponent(parent, 0, () => {
      shared = state(1);
      return null;
    });

    const scope = createChildScope(parent, 'row-1');
    scope.render(() => `${shared()}`);

    expect(parent._ownedChildScopes?.size ?? 0).toBe(1);
    expect(scope.componentInstance._pendingReadSources).toBeUndefined();
    expect(
      scope.componentInstance._lastReadSources?.has(
        shared as unknown as ReadableSource<unknown>
      )
    ).toBe(true);

    cleanupComponent(parent);

    expect(parent._ownedChildScopes?.size ?? 0).toBe(0);
    expect(scope.vnode).toBeUndefined();
    expect(scope.dom).toBeUndefined();
    expect(scope.needsDomUpdate).toBe(false);
    expect(scope.componentInstance._lastReadSources?.size ?? 0).toBe(0);
    expect((shared as unknown as ReaderTracked)._readers?.size ?? 0).toBe(0);

    expect(() => scope.render(() => 'x')).toThrow(/disposed child scope/);
  });

  it('should track reactive reads independently per child scope', () => {
    const parent = createComponentInstance('parent', () => null, {}, null);
    let leftSignal!: State<number>;
    let rightSignal!: State<number>;

    renderScopedComponent(parent, 0, () => {
      leftSignal = state(1);
      rightSignal = state(2);
      return null;
    });

    const leftScope = createChildScope(parent, 'left');
    const rightScope = createChildScope(parent, 'right');

    leftScope.render(() => `${leftSignal()}`);
    rightScope.render(() => `${rightSignal()}`);

    expect(
      leftScope.componentInstance._lastReadSources?.has(
        leftSignal as unknown as ReadableSource<unknown>
      )
    ).toBe(true);
    expect(
      leftScope.componentInstance._lastReadSources?.has(
        rightSignal as unknown as ReadableSource<unknown>
      )
    ).toBe(false);
    expect(
      rightScope.componentInstance._lastReadSources?.has(
        rightSignal as unknown as ReadableSource<unknown>
      )
    ).toBe(true);
    expect((leftSignal as unknown as ReaderTracked)._readers?.size ?? 0).toBe(
      1
    );
    expect((rightSignal as unknown as ReaderTracked)._readers?.size ?? 0).toBe(
      1
    );

    cleanupComponent(parent);

    expect((leftSignal as unknown as ReaderTracked)._readers?.size ?? 0).toBe(
      0
    );
    expect((rightSignal as unknown as ReaderTracked)._readers?.size ?? 0).toBe(
      0
    );
  });
});
