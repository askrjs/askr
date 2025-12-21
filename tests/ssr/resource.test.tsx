import { describe, it, expect } from 'vitest';
import { renderToStringSync, collectResources, resolveResources, renderToString, SSRDataMissingError } from '../../src/ssr';
import type { SSRRoute } from '../../src/ssr';
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


    // Create a component that calls resource() during render-time
    // Component that calls resource() during render to register an intent
    const dataRoutes: SSRRoute[] = [
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
    const plan = collectResources({ url: '/', routes: dataRoutes });
    expect(plan.resources.length).toBeGreaterThanOrEqual(1);

    // Resolve the plan (execute functions) and then render using the resolved data
    const data = await resolveResources(plan);

    const html = renderToString({ url: '/', routes: dataRoutes, data });
    expect(typeof html).toBe('string');
  });
});
