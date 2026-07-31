import { expect, test } from 'vite-plus/test';
import { loadBrowserHarness } from './_helpers';

interface RetainedFocusFixture {
  input: HTMLInputElement;
  row: HTMLElement;
  localButton: HTMLButtonElement;
  frameworkCount: HTMLOutputElement;
  nativeInputCount: () => number;
  focusExitCount: () => number;
}

function prepareFocusedRow(id: number): RetainedFocusFixture {
  const row = document.querySelector<HTMLElement>(`[data-focus-row="${id}"]`)!;
  const input = row.querySelector<HTMLInputElement>('input')!;
  const localButton = row.querySelector<HTMLButtonElement>('button')!;
  const frameworkCount = row.querySelector<HTMLOutputElement>(
    '[data-framework-count]'
  )!;
  let nativeInputs = 0;
  let focusExits = 0;
  input.addEventListener('input', () => nativeInputs++);
  input.addEventListener('blur', () => focusExits++);
  input.addEventListener('focusout', () => focusExits++);
  input.value = 'uncontrolled retained value';
  input.focus();
  input.setSelectionRange(3, 12, 'forward');

  return {
    input,
    row,
    localButton,
    frameworkCount,
    nativeInputCount: () => nativeInputs,
    focusExitCount: () => focusExits,
  };
}

function assertRetainedFocus(fixture: RetainedFocusFixture): void {
  expect(fixture.row.isConnected).toBe(true);
  expect(fixture.row.querySelector('input')).toBe(fixture.input);
  expect(document.activeElement).toBe(fixture.input);
  expect(fixture.input.value).toBe('uncontrolled retained value');
  expect(fixture.input.selectionStart).toBe(3);
  expect(fixture.input.selectionEnd).toBe(12);
  expect(fixture.input.selectionDirection).toBe('forward');
  expect(fixture.focusExitCount()).toBe(0);

  fixture.input.dispatchEvent(new Event('input', { bubbles: true }));
  expect(fixture.nativeInputCount()).toBe(1);
  expect(fixture.frameworkCount.textContent).toBe('1');
  fixture.localButton.click();
  expect(fixture.localButton.textContent).toContain('Local count 1');
}

test.each([
  ['reverse', 100, 50],
  ['reverse-fresh', 100, 50],
  ['sparse-front', 4_097, 2_000],
] as const)(
  'should retain focused keyed state during %s reordering',
  async (mode, count, focusedId) => {
    const app = await loadBrowserHarness();
    app.mountFocusReorderScenario(count);
    const fixture = prepareFocusedRow(focusedId);
    const originalIndex = fixture.row.getAttribute('data-index');

    app.reorderFocusRows(mode);

    assertRetainedFocus(fixture);
    expect(fixture.row.getAttribute('data-index')).not.toBe(originalIndex);
  }
);

test('should allow normal focus loss when the focused key is deleted', async () => {
  const app = await loadBrowserHarness();
  app.mountFocusReorderScenario(100);
  const fixture = prepareFocusedRow(50);

  app.reorderFocusRows('delete', 50);

  await expect.poll(() => fixture.row.isConnected).toBe(false);
  await expect
    .poll(() => document.querySelector('[data-focus-row="50"]'))
    .toBeNull();
  expect(document.activeElement).not.toBe(fixture.input);
});
