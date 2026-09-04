import { expect, test } from 'vite-plus/test';
import { loadBrowserHarness } from './_helpers';

test.each(['deterministic', 'native'] as const)(
  'should replay %s blur state written during a keyed bulk reorder',
  async (mode) => {
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
        if (mode === 'deterministic') {
          input.dispatchEvent(new FocusEvent('blur'));
        }
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
      if (mode === 'native') {
        input.focus();
        expect(document.activeElement).toBe(input);
      }

      app.reverseBulkCommitStateReplayRows();

      // Removal emits blur in Chromium. Firefox and WebKit remove focus without
      // dispatching that event. The deterministic case exercises writes in all engines.
      const emitsBlur =
        mode === 'deterministic' || /Chrome\//.test(navigator.userAgent);
      await expect
        .poll(() => list.firstElementChild?.getAttribute('data-row'))
        .toBe('199');
      await expect
        .poll(() => list.dataset.blurCount)
        .toBe(emitsBlur ? '1' : '0');
      expect(replaceChildrenCalls).toBe(1);
      expect(blurredDuringReplaceChildren).toBe(emitsBlur);
      expect(derivedReadDuringBlur).toBe(emitsBlur ? '0' : undefined);
      expect(list.dataset.derivedReadDuringBlur).toBe(
        emitsBlur ? '0' : 'pending'
      );
      await expect
        .poll(
          () =>
            document.querySelector('[aria-label="Bulk commit blur observer"]')
              ?.textContent
        )
        .toBe(emitsBlur ? '1' : '0');
      expect(list.firstElementChild?.getAttribute('data-row')).toBe('199');
      expect(input.isConnected).toBe(true);
    } finally {
      list.replaceChildren = originalReplaceChildren;
      app.cleanupBulkCommitStateReplayObserver();
    }
  }
);
