import { expect, test } from 'vite-plus/test';
import { loadBrowserHarness } from './_helpers';

test.each(['deterministic', 'native'] as const)(
  'should apply %s blur state written during a keyed reorder',
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
    const originalInsertBefore = list.insertBefore;
    let placementActive = false;
    let placementCalls = 0;
    let blurredDuringPlacement = false;
    let derivedReadDuringBlur: string | undefined;
    const beforePlacement = () => {
      placementCalls += 1;
      placementActive = true;
      if (mode === 'deterministic' && placementCalls === 1) {
        input.dispatchEvent(new FocusEvent('blur'));
      }
    };
    list.replaceChildren = (...nodes: Array<Node | string>) => {
      beforePlacement();
      try {
        originalReplaceChildren.call(list, ...nodes);
      } finally {
        placementActive = false;
      }
    };
    list.insertBefore = ((node: Node, reference: Node | null) => {
      beforePlacement();
      try {
        return originalInsertBefore.call(list, node, reference);
      } finally {
        placementActive = false;
      }
    }) as typeof list.insertBefore;
    input.addEventListener(
      'blur',
      () => {
        blurredDuringPlacement = placementActive;
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
      expect(placementCalls).toBeGreaterThan(0);
      expect(blurredDuringPlacement).toBe(emitsBlur);
      expect(derivedReadDuringBlur).toBe(emitsBlur ? '1' : undefined);
      expect(list.dataset.derivedReadDuringBlur).toBe(
        emitsBlur ? '1' : 'pending'
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
      list.insertBefore = originalInsertBefore;
      app.cleanupBulkCommitStateReplayObserver();
    }
  }
);
