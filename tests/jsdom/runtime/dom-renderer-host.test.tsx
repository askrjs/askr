import { expect, test } from 'vite-plus/test';
import {
  createDOMRendererHost,
  createRuntime,
  getDefaultRuntime,
  type DOMRendererHost,
  type DOMComponentOwner,
  type DOMReactiveSource,
} from '../../../src';

test('should construct without installation and preserve late role replacement and receivers', () => {
  const original = getDefaultRuntime().renderer;
  let roles!: DOMRendererHost;
  const adapter = createDOMRendererHost((native) => (roles = { ...native }));
  expect(getDefaultRuntime().renderer).toBe(original);
  const runtime = createRuntime({ renderer: adapter });
  expect(runtime.renderer).toBe(adapter);
  const target = document.createElement('main');
  adapter.evaluate(<span>native</span>, target);
  expect(target.textContent).toBe('native');
  const calls: object[] = [];
  roles.cleanup = {
    cleanupInstancesUnder() {
      calls.push(this);
    },
    teardownNodeSubtree() {
      calls.push(this);
    },
  };
  adapter.cleanupInstancesUnder(target);
  roles.cleanup.cleanupInstancesUnder = function () {
    calls.push(this);
  };
  adapter.cleanupInstancesUnder(target);
  expect(calls).toEqual([roles.cleanup, roles.cleanup]);
});

test('should reject incomplete roles even when configure mutates the native surface', () => {
  expect(() => createDOMRendererHost(() => ({}) as DOMRendererHost)).toThrow(
    TypeError
  );
  expect(() =>
    createDOMRendererHost((native) => {
      Reflect.deleteProperty(native, 'cleanup');
      return native;
    })
  ).toThrow(TypeError);
});

test('should preserve frozen handle identity and reject forged wrong-kind and foreign handles', () => {
  let native!: DOMRendererHost;
  const observed: DOMReactiveSource[] = [];
  const adapter = createDOMRendererHost((delegate) => {
    native = delegate;
    return {
      ...delegate,
      reactivity: {
        markReactivePropsDirtySource(source) {
          observed.push(source);
        },
      },
    };
  });
  const source = {} as Parameters<
    typeof adapter.markReactivePropsDirtySource
  >[0];
  adapter.markReactivePropsDirtySource(source);
  adapter.markReactivePropsDirtySource(source);
  expect(observed[0]).toBe(observed[1]);
  expect(Object.isFrozen(observed[0])).toBe(true);
  expect(Reflect.ownKeys(observed[0])).toEqual([]);
  const target = document.createElement('main');
  target.textContent = 'unchanged';
  expect(() =>
    native.evaluation.replaceComponentRange(
      observed[0] as unknown as DOMComponentOwner,
      null,
      target
    )
  ).toThrow(TypeError);
  expect(() =>
    native.evaluation.evaluate(null, target, undefined, {} as DOMComponentOwner)
  ).toThrow(TypeError);
  createDOMRendererHost((foreign) => {
    expect(() =>
      foreign.reactivity.markReactivePropsDirtySource(observed[0])
    ).toThrow(TypeError);
    return foreign;
  });
  expect(target.textContent).toBe('unchanged');
});
