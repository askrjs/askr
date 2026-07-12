import { bench, describe } from 'vite-plus/test';
import { flushScheduler } from '../../test-utils/render/test-renderer';
import type { BenchToggle } from '../shared/_shared';
import {
  assertSelectionTransition,
  assertToggleMutationGuard,
  buildRows,
  createCachedElementQuery,
  createSelectionToggle,
  mountTableBenchmark,
  tier3BenchOptions,
} from '../shared/_shared';

const initialRows = buildRows(1000);
const selectionBatchSize = 100;

function dispatchPrimaryLink(
  query: ReturnType<typeof createCachedElementQuery<HTMLElement>>,
  index: number
): void {
  query
    .getAt(index)
    .dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
  flushScheduler();
}

{
  const mounted = mountTableBenchmark(initialRows);
  try {
    const links = createCachedElementQuery<HTMLElement>(
      mounted.container,
      'tbody tr td:nth-child(2) a'
    );
    const toggle = createSelectionToggle(498, 499, 'first');

    dispatchPrimaryLink(links, toggle.current());
    assertSelectionTransition(mounted.container, 498);

    assertToggleMutationGuard(
      mounted.container,
      () => dispatchPrimaryLink(links, toggle.next()),
      () => dispatchPrimaryLink(links, toggle.next()),
      {
        label: 'tier3 production select',
        afterForward: () => assertSelectionTransition(mounted.container, 499),
        afterBackward: () => assertSelectionTransition(mounted.container, 498),
      }
    );
  } finally {
    mounted.cleanup();
  }
}

describe('tier3 system table production select', () => {
  let mounted: ReturnType<typeof mountTableBenchmark> | null = null;
  let links: ReturnType<typeof createCachedElementQuery<HTMLElement>> | null =
    null;
  let toggle: BenchToggle<number> | null = null;

  bench(
    'select 100 alternating rows through the DOM click path',
    () => {
      for (let index = 0; index < selectionBatchSize; index++) {
        dispatchPrimaryLink(links!, toggle!.next());
      }
    },
    {
      ...tier3BenchOptions,
      setup() {
        mounted = mountTableBenchmark(initialRows);
        links = createCachedElementQuery<HTMLElement>(
          mounted.container,
          'tbody tr td:nth-child(2) a'
        );
        toggle = createSelectionToggle(498, 499, 'first');
        dispatchPrimaryLink(links, toggle.current());
      },
      teardown() {
        mounted?.cleanup();
        mounted = null;
        links = null;
        toggle = null;
      },
    }
  );
});
