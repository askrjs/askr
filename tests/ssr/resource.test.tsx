import { describe, it, expect } from 'vitest';
import { renderToStringSync, collectResources, resolvePlan, renderToString, SSRDataMissingError } from '../../src/ssr';
import { resource as runtimeResource } from '../../src/runtime/operations';
import { resource } from '../../src/index';
import type { JSXElement } from '../../src/jsx/types';

describe('SSR resource behavior', () => {
  it('should throw SSRDataMissingError when resource() is called during SSR', () => {
    const Comp = () => {
      runtimeResource(async () => 'x');
      return { type: 'div', children: ['x'] };
    };

    expect(() => renderToStringSync(Comp)).toThrowError(SSRDataMissingError);
  });

  it('should throw when resource fn is async during synchronous SSR', () => {
    function App(): JSXElement {
      // illegal: async resource during SSR
      // fn returns a promise -> should throw during SSR
      // @ts-expect-error - testing runtime behavior
      resource(() => Promise.resolve('x'), []);
      return { type: 'div', props: { children: ['ok'] } };
    }

    expect(() =>
      renderToStringSync(App as unknown as () => JSXElement)
    ).toThrow();
  });
});

describe('SSR resource prepass', () => {
  it('should collect resources declaratively and resolve them', async () => {
    let executed = 0;
    const routes = [
      {
        path: '/',
        handler: () => {
          return {
            type: 'div',
            children: [
              { type: 'span', children: ['start'] },
              { type: 'div', children: [String(executed)] },
            ],
          };
        },
      },
    ];

    // Create a component that calls resource() during render-time
    // Component that calls resource() during render to register an intent
    const dataRoutes = [
      {
        path: '/',
        handler: () => {
          // register intent via resource()
          const r = runtimeResource;
          r(() => Promise.resolve('v'), []);
          return { type: 'div', children: ['x'] };
        },
      },
    ];

    // Collect (this will register resource intents but not execute them)
    const plan = collectResources({ url: '/', routes: dataRoutes as any });
    expect(plan.resources.length).toBeGreaterThanOrEqual(1);

    // Resolve the plan (execute functions) and then render using the resolved data
    const data = await resolvePlan(plan);

    const html = renderToString({ url: '/', routes: dataRoutes as any, data });
    expect(typeof html).toBe('string');
  });
});
