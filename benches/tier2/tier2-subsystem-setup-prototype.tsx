import { bench, describe, expect } from 'vite-plus/test';
import { createIsland } from '../../src/boot';
import { state } from '../../src';
import { defineSetupComponent } from '../../src/runtime/component/setup-prototype';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';
import { tier2BenchOptions } from '../shared/_shared';

const rowIds = Array.from({ length: 100 }, (_, index) => index);
const changedRowIds = [...rowIds.slice(10), ...rowIds.slice(0, 10)];

function LegacyRow({ id }: { id: number; key?: number }) {
  const count = state(0);
  return (
    <li>
      {id}:{count()}
    </li>
  );
}

const SetupRow = defineSetupComponent<{ id: number; key?: number }>(() => {
  const count = state(0);
  return ({ id }) => (
    <li>
      {id}:{count()}
    </li>
  );
});

function mountRows(kind: 'legacy' | 'setup') {
  const fixture = createTestContainer();
  let setTick!: (value: number) => void;
  let setIds!: (value: number[]) => void;
  const Page = () => {
    const tick = state(0);
    const ids = state(rowIds);
    setTick = tick.set;
    setIds = ids.set;
    return (
      <ul data-tick={tick()}>
        {ids().map((id) =>
          kind === 'legacy' ? (
            <LegacyRow key={id} id={id} />
          ) : (
            <SetupRow key={id} id={id} />
          )
        )}
      </ul>
    );
  };
  createIsland({ root: fixture.container, component: Page });
  expect(fixture.container.querySelectorAll('li')).toHaveLength(rowIds.length);
  return { ...fixture, setTick, setIds };
}

describe('tier2 setup component prototype', () => {
  for (const kind of ['legacy', 'setup'] as const) {
    bench(
      `${kind}: mount and clean up 100 stateful rows`,
      () => {
        const mounted = mountRows(kind);
        mounted.cleanup();
      },
      tier2BenchOptions
    );

    let mounted: ReturnType<typeof mountRows> | null = null;
    let tick = 0;
    bench(
      `${kind}: update parent around 100 keyed rows`,
      () => {
        mounted!.setTick(++tick);
        flushScheduler();
      },
      {
        ...tier2BenchOptions,
        setup() {
          tick = 0;
          mounted = mountRows(kind);
        },
        teardown() {
          mounted?.cleanup();
          mounted = null;
        },
      }
    );

    let listMounted: ReturnType<typeof mountRows> | null = null;
    let reordered = false;
    bench(
      `${kind}: reorder 100 keyed rows`,
      () => {
        reordered = !reordered;
        listMounted!.setIds(reordered ? changedRowIds : rowIds);
        flushScheduler();
      },
      {
        ...tier2BenchOptions,
        setup() {
          reordered = false;
          listMounted = mountRows(kind);
        },
        teardown() {
          listMounted?.cleanup();
          listMounted = null;
        },
      }
    );
  }
});
