import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser/context';
import { cleanupApp, createSPA } from '@askrjs/askr/boot';
import { createRouteRegistry, navigate, route } from '@askrjs/askr/router';

let originalUrl = '';
let root: HTMLElement;

beforeEach(() => {
  root = document.body.appendChild(document.createElement('div'));
  originalUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
});

afterEach(() => {
  cleanupApp(root);
  root.remove();
  window.history.replaceState({}, '', originalUrl);
});

test('should keep the history stack intact when a back/forward render fails', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  let failFlaky = false;
  window.history.replaceState({}, '', '/home');
  await createSPA({
    root,
    registry: createRouteRegistry(() => {
      route('/home', () => <p>{'home page'}</p>);
      route('/flaky', () => {
        if (failFlaky) throw new Error('flaky render failed');
        return <p>{'flaky page'}</p>;
      });
    }),
  });

  navigate('/flaky');
  await expect.element(page.getByText('flaky page')).toBeVisible();
  const length = window.history.length;

  window.history.back();
  await expect.element(page.getByText('home page')).toBeVisible();
  expect(window.location.pathname).toBe('/home');

  failFlaky = true;
  window.history.forward();
  await expect
    .poll(() =>
      errors.mock.calls.some((call) =>
        String(call[1]).includes('flaky render failed')
      )
    )
    .toBe(true);
  await expect.poll(() => window.location.pathname).toBe('/home');
  await expect.element(page.getByText('home page')).toBeVisible();
  expect(window.history.length).toBe(length);

  // The /flaky entry the user left must still be ahead of them.
  failFlaky = false;
  window.history.forward();
  await expect.poll(() => window.location.pathname).toBe('/flaky');
  await expect.element(page.getByText('flaky page')).toBeVisible();
  expect(window.history.length).toBe(length);
});
