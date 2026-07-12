import { describe, expect, it } from 'vite-plus/test';
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
