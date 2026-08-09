import { expect, test } from 'vite-plus/test';
import { loadBrowserHarness } from './_helpers';

test('should replay state written by blur during a keyed bulk reorder', async () => {
  const app = await loadBrowserHarness();
  app.mountBulkCommitStateReplayScenario();

  const list = document.querySelector<HTMLUListElement>(
    '[aria-label="Bulk commit state replay"]'
  )!;
  const input = document.querySelector<HTMLInputElement>(
    '[aria-label="Bulk row 100"]'
  )!;
  const originalReplaceChildren = list.replaceChildren;
  let replaceChildrenActive = false;
  let replaceChildrenCalls = 0;
  let blurredDuringReplaceChildren = false;
  let derivedReadDuringBlur: string | undefined;
  list.replaceChildren = (...nodes: Array<Node | string>) => {
    replaceChildrenCalls += 1;
    replaceChildrenActive = true;
    try {
      originalReplaceChildren.call(list, ...nodes);
    } finally {
      replaceChildrenActive = false;
    }
  };
  input.addEventListener(
    'blur',
    () => {
      blurredDuringReplaceChildren = replaceChildrenActive;
      derivedReadDuringBlur = list.dataset.derivedReadDuringBlur;
    },
    { once: true }
  );
  try {
    input.focus();
    expect(document.activeElement).toBe(input);

    app.reverseBulkCommitStateReplayRows();

    await expect.poll(() => list.dataset.blurCount).toBe('1');
    expect(replaceChildrenCalls).toBe(1);
    expect(blurredDuringReplaceChildren).toBe(true);
    expect(derivedReadDuringBlur).toBe('0');
    expect(list.dataset.derivedReadDuringBlur).toBe('0');
    await expect
      .poll(
        () =>
          document.querySelector('[aria-label="Bulk commit blur observer"]')
            ?.textContent
      )
      .toBe('1');
    expect(list.firstElementChild?.getAttribute('data-row')).toBe('199');
    expect(input.isConnected).toBe(true);
  } finally {
    app.cleanupBulkCommitStateReplayObserver();
  }
});
