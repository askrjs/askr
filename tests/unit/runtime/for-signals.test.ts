import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createChildScope } from '../../../src/runtime/child-scope';
import {
  cleanupComponent,
  createComponentInstance,
} from '../../../src/runtime/component';
import {
  createForIndexSignal,
  createForItemSignal,
  createReactiveForItem,
} from '../../../src/runtime/for-signals';
import { logger } from '../../../src/common/logger';

describe('For signal allocation', () => {
  it('should materialize reader registries only after a component subscribes', () => {
    const index = createForIndexSignal(0);
    const item = createForItemSignal({ id: 1, label: 'One' });
    const reactiveState = createReactiveForItem({ id: 1, label: 'One' });
    const reactiveItem = reactiveState.proxy;

    expect(index._readers).toBeUndefined();
    expect(item._readers).toBeUndefined();
    expect(reactiveState.propertySignals).toBeNull();

    const parent = createComponentInstance('parent', () => null, {}, null);
    const scope = createChildScope(parent, 'row');
    scope.render(() => `${index()}:${reactiveItem.label}`);

    expect(index._readers?.has(scope.componentInstance)).toBe(true);
    expect(
      reactiveState.propertySignals
        ?.get('label')
        ?._readers?.has(scope.componentInstance)
    ).toBe(true);
    expect(item._readers).toBeUndefined();

    cleanupComponent(parent);
  });
});

describe('For item proxy write collisions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should warn in dev when a write shadows a live source-item key', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const reactiveState = createReactiveForItem({ id: 1, done: false });
    const reactiveItem = reactiveState.proxy as { id: number; done: boolean };

    reactiveItem.done = true;

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/done/);
    // The write itself still succeeds (existing "own property" semantics
    // are unchanged) - only the collision with a live source key is flagged.
    expect(reactiveItem.done).toBe(true);
  });

  it('should not warn when writing a new property that has no source-item collision', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const reactiveState = createReactiveForItem({ id: 1, label: 'Alpha' });
    const reactiveItem = reactiveState.proxy as {
      id: number;
      label: string;
      badge?: string;
    };

    reactiveItem.badge = 'badge:Alpha';

    expect(warnSpy).not.toHaveBeenCalled();
    expect(reactiveItem.badge).toBe('badge:Alpha');
  });

  it('should only warn once for repeated writes to the same already-owned key', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const reactiveState = createReactiveForItem({ id: 1, done: false });
    const reactiveItem = reactiveState.proxy as { id: number; done: boolean };

    reactiveItem.done = true;
    reactiveItem.done = false;
    reactiveItem.done = true;

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
