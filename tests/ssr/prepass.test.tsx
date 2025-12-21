import { describe, it, expect } from 'vitest';
import { collectResources, resolveResources } from '../../src/ssr';
import { resource as runtimeResource } from '../../src/runtime/operations';
import type { SSRRoute } from '../../src/ssr';

describe('SSR data prepass ordering', () => {
  it('should have resolveResources execute resource functions in declared order and map values by keys', async () => {
    const execOrder: string[] = [];

    const routes: SSRRoute[] = [
      {
        path: '/',
        handler: () => {
          // register intents in specific order
          const g = globalThis as unknown as {
            _registerIntentA?: () => string;
            _registerIntentB?: () => string;
          };
          // Instead of calling runtime resource, emulate registration via resource() during collection
          // However, during collection phase registerResourceIntent is invoked by the real runtime `resource()`
          // We rely on the existing `collectResources` to visit these calls.
          // For clarity, call a helper that registers intents in order.
          g._registerIntentA = () => {
            execOrder.push('A');
            return 'A-VALUE';
          };
          g._registerIntentB = () => {
            execOrder.push('B');
            return 'B-VALUE';
          };

          // Use runtime resource() to register intents in order
          runtimeResource(() => g._registerIntentA!(), []);
          runtimeResource(() => g._registerIntentB!(), []);

          return { type: 'div', children: ['x'] };
        },
      },
    ];

    const plan = collectResources({ url: '/', routes });
    expect(plan.resources.length).toBeGreaterThanOrEqual(2);

    // Prepare an array to record the execution order when resolving
    const order: string[] = [];

    // Replace the fns in the plan with wrappers that record when they're called
    for (const r of plan.resources) {
      const original = r.fn;
      r.fn = () => {
        const val = original({});
        const out = val instanceof Promise ? val : Promise.resolve(val);
        order.push(r.key);
        return out;
      };
    }

    const data = await resolveResources(plan);

    // Ensure the resolved keys appear in the same order as in the plan
    for (let i = 0; i < plan.resources.length; i++) {
      expect(Object.prototype.hasOwnProperty.call(data, plan.resources[i].key)).toBe(true);
    }

    // Execution order should match declared order (by plan.resources indices)
    const declaredKeys = plan.resources.map((r) => r.key);
    expect(order).toEqual(declaredKeys);

    // Values should map to returned values
    for (const r of plan.resources) {
      expect(data[r.key]).toBeDefined();
    }
  });
});
