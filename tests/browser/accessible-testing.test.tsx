import { expect, test } from 'vite-plus/test';
import { page, userEvent } from 'vitest/browser';
import { render } from '@askrjs/askr/testing';
import { makeAccessibleForm } from '../consumer-contracts/accessible-testing-fixture';

test('should preserve native browser focus, text replacement, button activation and popup dismissal', async () => {
  const view = render(makeAccessibleForm('native'));
  const keyTrust: boolean[] = [];
  const record = (event: Event) => {
    keyTrust.push(event.isTrusted);
  };
  view.container.addEventListener('keydown', record);
  try {
    // macOS WebKit uses Option-Tab to include buttons with its default
    // keyboard-navigation setting. Keep traversal native in every engine.
    const optionTab =
      /Mac/.test(navigator.platform) &&
      /AppleWebKit/.test(navigator.userAgent) &&
      !/Chrome/.test(navigator.userAgent);
    const tab = async (backward = false) => {
      await userEvent.keyboard(
        `${optionTab ? '{Alt>}' : ''}${backward ? '{Shift>}' : ''}{Tab}${backward ? '{/Shift}' : ''}${optionTab ? '{/Alt}' : ''}`
      );
    };
    const input = view.container.querySelector('input')!;
    await expect.element(input).toHaveAccessibleName('Display name');
    await expect.element(input).toHaveAccessibleDescription('Public name');
    await page.getByText('Display name', { exact: true }).click();
    expect(document.activeElement).toBe(input);
    await page.getByRole('textbox', { name: 'Display name' }).fill('Axxa');
    input.setSelectionRange(1, 3);
    await userEvent.keyboard('d');
    view.flush();
    expect(input.value).toBe('Ada');
    await tab();
    expect(document.activeElement?.textContent).toBe('Save');
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    view.flush();
    expect(view.container.querySelector('[role="status"]')?.textContent).toBe(
      'Saved Ada (2)'
    );
    await tab();
    expect(document.activeElement?.textContent).toBe('Open actions');
    await tab(true);
    expect(document.activeElement?.textContent).toBe('Save');
    await tab();
    await userEvent.keyboard('{Enter}');
    view.flush();
    await tab();
    expect(document.activeElement?.textContent).toBe('Close');
    await userEvent.keyboard('{Escape}');
    view.flush();
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement?.textContent).toBe('Open actions');
    expect(keyTrust.length).toBeGreaterThan(8);
    expect(keyTrust.every(Boolean)).toBe(true);
  } finally {
    view.container.removeEventListener('keydown', record);
    view.cleanup();
  }
});
