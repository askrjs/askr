import { expect, test } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser/context';
import { cleanupApp, createSPA } from '@askrjs/askr/boot';
import {
  Link,
  blockNavigation,
  createRouteRegistry,
  navigate,
  navigationState,
  route,
} from '@askrjs/askr/router';

// @askr-allow-real-timers -- native focus and history settle asynchronously.

function mount(): HTMLElement {
  return document.body.appendChild(document.createElement('div'));
}

test('should move native focus to main and announce the title after a link click', async () => {
  const root = mount();
  const before = location.href;
  history.pushState({ askrIndex: 0 }, '', '/ux-home');
  try {
    await createSPA({
      root,
      registry: createRouteRegistry(() => {
        route('/ux-home', () => <Link href="/ux-next">Next page</Link>);
        route(
          '/ux-next',
          () => (
            <main>
              <h1>Next heading</h1>
            </main>
          ),
          { meta: { title: 'Next title' } }
        );
      }),
    });
    await page.getByRole('link', { name: 'Next page' }).click();
    await expect
      .poll(() => document.activeElement?.tagName.toLowerCase())
      .toBe('main');
    await expect
      .poll(() => document.querySelector('[data-askr-announcer]')?.textContent)
      .toBe('Next title');
  } finally {
    cleanupApp(root);
    root.remove();
    document.querySelector('[data-askr-announcer]')?.remove();
    history.replaceState({}, '', before);
  }
});

test('should report a pending navigation while a loader runs', async () => {
  const root = mount();
  const before = location.href;
  history.pushState({ askrIndex: 0 }, '', '/ux-pending-home');
  let release!: (value: string) => void;
  const slow = new Promise<string>((resolve) => {
    release = resolve;
  });
  try {
    await createSPA({
      root,
      registry: createRouteRegistry(() => {
        route('/ux-pending-home', () => (
          <p>{navigationState().pending ? 'loading' : 'idle'}</p>
        ));
        route('/ux-pending-slow', () => <p>slow page</p>, {
          loader: () => slow,
        });
      }),
    });
    expect(root.textContent).toBe('idle');
    navigate('/ux-pending-slow');
    await expect.poll(() => root.textContent).toBe('loading');
    release('done');
    await expect.poll(() => root.textContent).toBe('slow page');
  } finally {
    cleanupApp(root);
    root.remove();
    history.replaceState({}, '', before);
  }
});

test('should keep the page when a blocker refuses a native back traversal', async () => {
  const root = mount();
  const before = location.href;
  history.pushState({ askrIndex: 0 }, '', '/ux-block-a');
  const unblock = [] as Array<() => void>;
  try {
    await createSPA({
      root,
      registry: createRouteRegistry(() => {
        route('/ux-block-a', () => <p>block a</p>);
        route('/ux-block-b', () => <p>block b</p>);
      }),
    });
    navigate('/ux-block-b');
    await expect.poll(() => root.textContent).toBe('block b');
    unblock.push(blockNavigation(() => true));

    history.back();
    await expect.poll(() => location.pathname).toBe('/ux-block-b');
    expect(root.textContent).toBe('block b');
  } finally {
    for (const release of unblock) release();
    cleanupApp(root);
    root.remove();
    history.replaceState({}, '', before);
  }
});
