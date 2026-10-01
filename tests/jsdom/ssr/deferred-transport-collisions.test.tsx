import { describe, expect, it } from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import { takeHydrationRenderData } from '../../../src/boot/hydration';
import { defer, isDeferred } from '../../../src/common/deferred-value';
import { createPageRenderEnvelope } from '../../../src/common/page-render-envelope';
import { routeData } from '../../../src/router/deferred';
import { createRouteRegistry, route } from '../../../src/router/route';
import { renderRouteRequestToString } from '../../../src/ssr';
import { serializeHydrationRenderData } from '../../../src/ssr/hydration-data';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

describe('deferred hydration transport identity', () => {
  it('should hydrate ordinary loader records that resemble deferred payloads unchanged', async () => {
    const { container, cleanup } = createTestContainer();
    const data = {
      __askr_deferred__: 'fulfilled',
      value: 'ordinary record',
      extra: 42,
      nested: { __askr_deferred__: 'rejected', error: 'ordinary error' },
    };
    const registry = createRouteRegistry(() => {
      route('/collision', () => <p>{JSON.stringify(routeData())}</p>, {
        loader: () => data,
      });
    });
    try {
      window.history.replaceState({}, '', '/collision');
      const result = await renderRouteRequestToString({
        url: '/collision',
        registry,
      });
      if (result.kind !== 'render') throw new Error('expected render');
      container.innerHTML = result.html;
      const serverNode = container.querySelector('p');
      await hydrateSPA({ root: container, registry });
      expect(container.querySelector('p')).toBe(serverNode);
      expect(serverNode?.textContent).toBe(JSON.stringify(data));
    } finally {
      cleanup();
      window.history.replaceState({}, '', '/');
    }
  });

  it('should revive only actual deferred values, including nested values and special property names', async () => {
    const plain = { __askr_deferred__: 'fulfilled', value: 'plain', extra: 42 };
    const inner = defer(Promise.resolve(plain));
    await inner.promise;
    const outer = defer(Promise.resolve({ inner, plain }));
    await outer.promise;
    const special = JSON.parse('{"__proto__":null}') as Record<string, unknown>;
    special.__proto__ = inner;
    const payload = createPageRenderEnvelope({
      route: { outer, plain, special, array: [inner, plain], '': inner },
    });
    const container = document.createElement('div');
    container.innerHTML = serializeHydrationRenderData(payload);
    const result = takeHydrationRenderData(container)
      ?.route as typeof payload.route & {
      outer: typeof outer;
      plain: typeof plain;
      special: Record<string, typeof inner>;
      array: unknown[];
      '': typeof inner;
    };
    expect(isDeferred(result.outer)).toBe(true);
    expect(isDeferred(result.outer.value?.inner)).toBe(true);
    expect(result.outer.value?.inner.value).toEqual(plain);
    expect(isDeferred(result.outer.value?.plain)).toBe(false);
    expect(result.plain).toEqual(plain);
    expect(Object.hasOwn(result.special, '__proto__')).toBe(true);
    expect(isDeferred(result.special.__proto__)).toBe(true);
    expect(Object.getPrototypeOf(result.special)).toBe(Object.prototype);
    expect(isDeferred(result.array[0])).toBe(true);
    expect(result.array[1]).toEqual(plain);
    expect(isDeferred(result[''])).toBe(true);
  });

  it('should continue hydrating deferred values in previously generated pages', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<script type="application/json" data-askr-render-data="true">{"version":1,"resources":{},"route":{"__askr_deferred__":"fulfilled","value":"legacy"},"framework":{}}</script>';
    const value = takeHydrationRenderData(container)?.route;
    expect(isDeferred(value)).toBe(true);
    if (!isDeferred(value)) throw new Error('expected deferred');
    expect(value.value).toBe('legacy');
  });
});
