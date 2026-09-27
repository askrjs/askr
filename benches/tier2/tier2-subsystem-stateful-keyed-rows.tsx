import { bench, describe, expect } from 'vite-plus/test';
import { createIsland } from '../../src/boot';
import { state } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';
import { tier2BenchOptions } from '../shared/_shared';

const rowIds = Array.from({ length: 100 }, (_, index) => index);
const changedRowIds = [...rowIds.slice(10), ...rowIds.slice(0, 10)];

function StatefulRow({ id }: { id: number; key?: number }) {
  const count = state(0);
  return <li>{`${id}:${count()}`}</li>;
}

function mountRows() {
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
        {ids().map((id) => (
          <StatefulRow key={id} id={id} />
        ))}
      </ul>
    );
  };
  createIsland({ root: fixture.container, component: Page });
  expect(fixture.container.querySelectorAll('li')).toHaveLength(rowIds.length);
  return { ...fixture, setTick, setIds };
}

describe('tier2 stateful keyed rows', () => {
  bench(
    'mount and clean up 100 stateful rows',
    () => {
      const mounted = mountRows();
      mounted.cleanup();
    },
    tier2BenchOptions
  );

  let mounted: ReturnType<typeof mountRows> | null = null;
  let tick = 0;
  bench(
    'update parent around 100 keyed rows',
    () => {
      mounted!.setTick(++tick);
      flushScheduler();
    },
    {
      ...tier2BenchOptions,
      setup() {
        tick = 0;
        mounted = mountRows();
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
    'reorder 100 keyed rows',
    () => {
      reordered = !reordered;
      listMounted!.setIds(reordered ? changedRowIds : rowIds);
      flushScheduler();
    },
    {
      ...tier2BenchOptions,
      setup() {
        reordered = false;
        listMounted = mountRows();
      },
      teardown() {
        listMounted?.cleanup();
        listMounted = null;
      },
    }
  );
});
