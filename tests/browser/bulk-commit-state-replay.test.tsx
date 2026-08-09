import { expect, test } from 'vite-plus/test';
import { state, type State } from '../../src';
import { createIsland } from '../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';

test('should replay state written by blur during a keyed bulk reorder', () => {
  const { container, cleanup } = createTestContainer();
  let rows!: State<number[]>;
  let replaceChildrenActive = false;
  let replaceChildrenCalls = 0;
  let blurredDuringReplaceChildren = false;

  function App() {
    rows = state(Array.from({ length: 200 }, (_, index) => index));
    const blurCount = state(0);

    return (
      <ul data-blur-count={String(blurCount())}>
        {rows().map((row) => (
          <li key={row} data-row={String(row)}>
            <input
              aria-label={`Row ${row}`}
              onBlur={() => {
                blurredDuringReplaceChildren = replaceChildrenActive;
                blurCount.set((count) => count + 1);
              }}
            />
          </li>
        ))}
      </ul>
    );
  }

  try {
    createIsland({ root: container, component: App });
    flushScheduler();

    const list = container.querySelector('ul')!;
    const replaceChildren = list.replaceChildren;
    list.replaceChildren = (...nodes: Array<Node | string>) => {
      replaceChildrenCalls += 1;
      replaceChildrenActive = true;
      try {
        replaceChildren.call(list, ...nodes);
      } finally {
        replaceChildrenActive = false;
      }
    };

    const input = container.querySelector<HTMLInputElement>(
      '[aria-label="Row 100"]'
    )!;
    input.focus();
    expect(document.activeElement).toBe(input);

    rows.set([...rows()].reverse());
    flushScheduler();

    expect(input.isConnected).toBe(true);
    expect(replaceChildrenCalls).toBe(1);
    expect(blurredDuringReplaceChildren).toBe(true);
    expect(container.firstElementChild?.getAttribute('data-blur-count')).toBe(
      '1'
    );
  } finally {
    cleanup();
  }
});
