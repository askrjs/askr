import { describe, it, expect } from 'vite-plus/test';
import { createChildScope } from '../../../src/runtime/child-scope';
import {
  cleanupComponent,
  createComponentInstance,
  renderScopedComponent,
} from '../../../src/runtime/component';
import {
  notifyReadableReaders,
  recordReadableRead,
  type ReadableSource,
} from '../../../src/runtime/readable';
import { state, type State } from '../../../src/runtime/state';
import { flushScheduler } from '../../../test-utils/render/test-renderer';

type ReaderTracked = {
  _readers?: Map<unknown, unknown>;
};

describe('child scope runtime', () => {
  it('should not materialize an empty committed read set for static scopes', () => {
    const parent = createComponentInstance('parent', () => null, {}, null);
    const scope = createChildScope(parent, 'static');

    expect(scope.componentInstance._lastReadSources).toBeUndefined();

    scope.render(() => 'static');

    expect(scope.componentInstance._lastReadSources).toBeUndefined();

    cleanupComponent(parent);
  });

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

  it('should replay a child scope update through the scope flush task when a readable changes during render', () => {
    const parent = createComponentInstance('parent', () => null, {}, null);
    let content = 'Loading';
    let dirtyCount = 0;

    const topology = (() => {
      recordReadableRead(topology as unknown as ReadableSource<string>);
      return content;
    }) as ReadableSource<string>;

    const scope = createChildScope(parent, 'topology', () => {
      dirtyCount += 1;
    });

    scope.render(() => {
      const value = topology();

      if (value === 'Loading') {
        content = 'Ready';
        notifyReadableReaders(topology);
      }

      return value;
    });

    expect(scope.vnode).toBe('Loading');
    expect(dirtyCount).toBe(0);

    flushScheduler();

    expect(scope.vnode).toBe('Ready');
    expect(dirtyCount).toBe(1);

    cleanupComponent(parent);
  });
});
