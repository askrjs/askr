import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { For } from '../../../src/control';
import { state } from '../../../src/index';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

// NOTE: this file does NOT reproduce the specific "SWAP fast path drops
// another row's pending update" bug (for-reconcile.ts's SWAP eligibility
// guard previously didn't check `existing.scope.needsDomUpdate`, unlike its
// sibling INSERT_ONE guard). That bug's only known trigger is a row whose
// `ChildScope.markDirty()` gets called internally via the "indirectly reads
// an index signal" path in for-scopes.ts's syncForItemIndex, in the same
// transaction as an unrelated two-item swap - a narrow internal-timing
// scenario that a local `state()` update inside a row does NOT reach,
// because a row's own state update re-renders independently through the
// normal scheduler rather than through the array-level commitSwap dirty-
// index scan. This test is a coexistence sanity check (a local per-row
// state update alongside an unrelated swap should still work), not a
// black-box regression test for that specific gap. The fix itself
// (for-reconcile.ts's SWAP eligibility guard now also bails on
// `existing.scope.needsDomUpdate`, mirroring INSERT_ONE) was applied
// defensively without a reproducing end-to-end test.
describe('for-swap-with-unrelated-local-state-update', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const ctx = createTestContainer();
    container = ctx.container;
    cleanup = ctx.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should still apply an unrelated row own-state update that lands in the same flush as a two-item swap', () => {
    let rows: ReturnType<typeof state<Array<{ id: string }>>> | null = null;
    let setDLabel: ((value: string) => void) | null = null;

    const initial = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

    const Component = () => {
      rows = state(initial);

      return (
        <ul>
          <For each={() => rows!()} by={(item) => item.id}>
            {(item) => {
              if (item.id === 'd') {
                const [label, setLabel] = state('D');
                setDLabel = setLabel;
                return <li>{label()}</li>;
              }
              return <li>{item.id}</li>;
            }}
          </For>
        </ul>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    expect(setDLabel).not.toBeNull();

    // Swap the first two items AND update 'd's own local state in the same
    // tick, before flushing - both updates should land in the same commit.
    // 'c' and 'd' keep their exact original object references (untouched)
    // so the swap eligibility check doesn't disqualify on content change.
    const [a, b, c, d] = initial;
    rows!.set([b, a, c, d]);
    setDLabel!('D2');
    flushScheduler();

    const texts = Array.from(container.querySelectorAll('li')).map(
      (el) => el.textContent
    );

    expect(texts).toEqual(['b', 'a', 'c', 'D2']);
  });
});
