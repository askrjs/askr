import { expect, test } from 'vite-plus/test';
import { page, userEvent } from 'vitest/browser';
import { cleanupApp, hydrateSPA } from '@askrjs/askr/boot';
import { renderToString } from '@askrjs/askr/ssr';
import { flush } from '@askrjs/askr/testing';
import {
  createIdScreen,
  idRegistry,
} from '../consumer-contracts/stable-association-ids-fixture';

test('should focus and name the retained hydrated control through its supplied label association', async () => {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const screen = createIdScreen('browser-profile', ['alpha']);
  const registry = idRegistry(screen.Screen);
  try {
    root.innerHTML = renderToString({ url: window.location.href, registry });
    const original = root.querySelector('input')!;
    await hydrateSPA({ root, registry, hydrate: { verifyMarkup: true } });
    expect(root.querySelector('input')).toBe(original);
    await expect.element(original).toHaveAccessibleName('Display name alpha');
    await expect
      .element(original)
      .toHaveAccessibleDescription('Visible to alpha teammates');
    await userEvent.click(root.querySelector('label')!);
    expect(document.activeElement).toBe(original);
    await page.getByRole('textbox', { name: 'Display name alpha' }).fill('Ada');
    flush();
    expect(screen.edits()).toBe(1);
    expect(root.querySelector('output')?.textContent).toBe('Ada');
    expect(root.querySelector('input')).toBe(original);
    await userEvent.keyboard('{Tab}');
    expect(original.id).toBe('browser-profile:alpha:display-name');
  } finally {
    cleanupApp(root);
    root.remove();
  }
});
