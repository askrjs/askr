/**
 * nested-for.bench.tsx
 *
 * PURPOSE: Measure nested `For` rendering and inner-item update cost.
 */

import { bench, describe, beforeAll, afterAll } from 'vitest';
import { createIsland, state } from '../../src';
import type { State } from '../../src';
import { For } from '../../src/for';
import { createTestContainer, flushScheduler } from '../../tests/helpers/test-renderer';

interface Inner {
  id: number;
  label: string;
}

interface Outer {
  id: number;
  inner: Inner[];
}

function createOuter(outerCount: number, innerCount: number): Outer[] {
  const out: Outer[] = [];
  for (let i = 0; i < outerCount; i++) {
    const inner: Inner[] = [];
    for (let j = 0; j < innerCount; j++) {
      inner.push({ id: j, label: `I${i}-${j}` });
    }
    out.push({ id: i, inner });
  }
  return out;
}

function updateAllInner(outers: Outer[]): Outer[] {
  return outers.map((o) => ({
    ...o,
    inner: o.inner.map((ii) => ({ ...ii, label: ii.label + '!' })),
  }));
}

describe('nested-for', () => {
  describe('100 outer x 10 inner - update inner (transactional)', () => {
    let container: HTMLElement;
    let cleanup: () => void;
    let outers!: State<Outer[]>;

    const OUTER = 100;
    const INNER = 10;
    const ITERS = 50;

    beforeAll(() => {
      const ctx = createTestContainer();
      container = ctx.container;
      cleanup = ctx.cleanup;

      const Component = () => {
        outers = state(createOuter(OUTER, INNER));

        return (
          <div>
            {For(() => outers(), (o) => (
              <div key={o.id} data-id={String(o.id)}>
                <div>
                  {For(() => o.inner, (ii) => (
                    <span key={ii.id} data-id={String(ii.id)}>{ii.label}</span>
                  ) as unknown as any)}
                </div>
              </div>
            ) as unknown as any)}
          </div>
        );
      }; 

      createIsland({ root: container, component: Component });
      flushScheduler();
    });

    bench('framework::for::nested-update::100x10', () => {
      for (let i = 0; i < ITERS; i++) {
        outers.set(updateAllInner(outers()));
      }
    });

    afterAll(() => cleanup());
  });

  describe('mount cost - 100 outer x 100 inner (one-off)', () => {
    bench('framework::for::nested::mount::100x100', () => {
      const { container, cleanup } = createTestContainer();

      const Component = () => {
        const local = state(createOuter(100, 100));
        return (
          <div>
            {For(() => local(), (o) => (
              <div key={o.id} data-id={String(o.id)}>
                <div>
                  {For(() => o.inner, (ii) => (
                    <span key={ii.id} data-id={String(ii.id)}>{ii.label}</span>
                  ) as unknown as any)}
                </div>
              </div>
            ) as unknown as any)}
          </div>
        );
      }; 

      createIsland({ root: container, component: Component });
      flushScheduler();

      cleanup();
    });
  });
});
