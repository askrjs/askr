import { describe, expect, it } from 'vite-plus/test';
import {
  cleanupComponent,
  createComponentInstance,
  renderComponentInline,
} from '../../../src/runtime/component';
import { captureComponentGeneration } from '../../../src/runtime/component-generation';
import { createChildScope } from '../../../src/runtime/child-scope';
import { commitLifecycleForInstance } from '../../../src/runtime/component-lifecycle';

describe('owner disposal', () => {
  it('should release a child scope when its component is disposed directly', () => {
    const parent = createComponentInstance('parent', () => null, {}, null);
    const scope = createChildScope(parent, 'child');
    scope.render(() => 'child');
    cleanupComponent(scope.componentInstance);
    expect(scope.vnode).toBeUndefined();
    expect(scope.needsDomUpdate).toBe(false);
    expect(parent.ownership.children?.size ?? 0).toBe(0);
    expect(() => scope.dispose()).not.toThrow();
    cleanupComponent(parent);
  });

  it('should keep a captured execution signal bound to its original lifetime', () => {
    let readSignal!: () => AbortSignal;
    const instance = createComponentInstance(
      'owner',
      (_props, context) => {
        readSignal = () => context.signal;
        return null;
      },
      {},
      null
    );
    renderComponentInline(instance);
    const oldSignal = readSignal();
    const readOldSignal = readSignal;
    const prepared = captureComponentGeneration(instance);
    prepared.prepare(instance.fn, {});
    renderComponentInline(instance);
    const currentSignal = readSignal();
    expect(currentSignal).not.toBe(oldSignal);
    prepared.retire();
    expect(oldSignal.aborted).toBe(true);
    expect(readOldSignal()).toBe(oldSignal);
    expect(currentSignal.aborted).toBe(false);
    cleanupComponent(instance);
    expect(currentSignal.aborted).toBe(true);
  });

  it('should dispose a returned cleanup without attaching it to a replacement generation', () => {
    const instance = createComponentInstance('owner', () => null, {}, null);
    const events: string[] = [];
    instance.ownership.mounted = true;
    instance.mountOperations = [
      () => {
        const prepared = captureComponentGeneration(instance);
        prepared.prepare(() => null, {});
        prepared.retire();
        return () => {
          events.push('retired');
        };
      },
    ];
    commitLifecycleForInstance(instance, true);
    expect(events).toEqual(['retired']);
    expect(instance.ownership.cleanups).toBeUndefined();
    cleanupComponent(instance);
    expect(events).toEqual(['retired']);
  });

  it('should invalidate a lifetime once despite reentrant and repeated disposal', () => {
    const instance = createComponentInstance('owner', () => null, {}, null);
    const events: string[] = [];
    instance.ownership.mounted = true;
    instance.ownership.cleanups = [
      () => {
        events.push('first');
        cleanupComponent(instance);
      },
      () => events.push('second'),
    ];
    cleanupComponent(instance);
    cleanupComponent(instance);
    expect(events).toEqual(['first', 'second']);
    expect(instance.lifecycleGeneration).toBe(1);
    expect(instance.evaluationGeneration).toBe(1);
  });

  it('should release child scope references after strict cleanup fails', () => {
    const scope = createChildScope(null, 'failing');
    scope.render(() => 'retained');
    scope.dom = document.createTextNode('retained');
    scope.blueprintOwner = {};
    scope.componentInstance.cleanupStrict = true;
    scope.componentInstance.ownership.cleanups = [
      () => {
        throw new Error('cleanup');
      },
    ];
    expect(() => scope.dispose()).toThrow(AggregateError);
    expect(scope.vnode).toBeUndefined();
    expect(scope.previousVnode).toBeUndefined();
    expect(scope.dom).toBeUndefined();
    expect(scope.range).toBeUndefined();
    expect(scope.blueprintOwner).toBeUndefined();
    expect(scope.needsDomUpdate).toBe(false);
    expect(() => scope.dispose()).not.toThrow();
  });

  it('should settle cleanup returned by an operation that disposes its owner', () => {
    const instance = createComponentInstance('owner', () => null, {}, null);
    const events: string[] = [];
    instance.ownership.mounted = true;
    instance.mountOperations = [
      () => {
        events.push('mount');
        cleanupComponent(instance);
        return () => {
          events.push('cleanup');
        };
      },
    ];
    commitLifecycleForInstance(instance, true);
    expect(events).toEqual(['mount', 'cleanup']);
    expect(instance.ownership.cleanups).toBeUndefined();
    cleanupComponent(instance);
    expect(events).toEqual(['mount', 'cleanup']);
  });
});
