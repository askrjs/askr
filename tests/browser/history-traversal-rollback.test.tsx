import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser/context';
import { cleanupApp, createSPA } from '@askrjs/askr/boot';
import { createRouteRegistry, navigate, route } from '@askrjs/askr/router';

// @askr-allow-real-timers -- browser history traversals settle asynchronously.

type NavigateEventLike = Event & { navigationType: string };
type NavigationLike = EventTarget;

let originalUrl = '';
let root: HTMLElement;
let errors: ReturnType<typeof vi.spyOn>;
let reloads = 0;

// A reload would unload the test runner; cancel and count it instead.
function cancelReload(event: Event): void {
  if ((event as NavigateEventLike).navigationType !== 'reload') return;
  event.preventDefault();
  reloads += 1;
}

function browserNavigation(): NavigationLike {
  const navigation = (window as Window & { navigation?: NavigationLike })
    .navigation;
  if (!navigation) throw new Error('This browser lacks the Navigation API.');
  return navigation;
}

beforeEach(() => {
  reloads = 0;
  browserNavigation().addEventListener('navigate', cancelReload);
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.body.appendChild(document.createElement('div'));
  originalUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
});

afterEach(() => {
  browserNavigation().removeEventListener('navigate', cancelReload);
  errors.mockRestore();
  cleanupApp(root);
  root.remove();
  window.history.replaceState({}, '', originalUrl);
});

/** Start on a fresh entry at position 0, as a newly loaded document would. */
function startAt(path: string): void {
  window.history.replaceState({ askrIndex: 0 }, '', path);
}

function renderedPath(): string | null | undefined {
  return root.querySelector('[data-page]')?.getAttribute('data-page');
}

function Page({ path }: { path: string }) {
  return <p data-page={path}>{`${path} page`}</p>;
}

async function waitForRenderFailure(message: string): Promise<void> {
  await expect
    .poll(() =>
      errors.mock.calls.some((call) => String(call[1]).includes(message))
    )
    .toBe(true);
}

async function settleTraversal(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 200));
}

test('should keep the history stack intact when a back/forward render fails', async () => {
  let failFlaky = false;
  startAt('/home');
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
  await waitForRenderFailure('flaky render failed');
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

test('should return to the rendered entry when a failed traversal superseded a pending one', async () => {
  let holdB = false;
  let failA = false;
  startAt('/a');
  await createSPA({
    root,
    registry: createRouteRegistry(() => {
      route('/a', () => {
        if (failA) throw new Error('a render failed');
        return <Page path="/a" />;
      });
      route('/b', () => <Page path="/b" />, {
        loader: () => (holdB ? new Promise<never>(() => {}) : 'b'),
      });
      route('/c', () => <Page path="/c" />);
    }),
  });
  navigate('/b');
  await expect.poll(renderedPath).toBe('/b');
  navigate('/c');
  await expect.poll(renderedPath).toBe('/c');

  holdB = true;
  failA = true;
  window.history.back();
  await expect.poll(() => window.location.pathname).toBe('/b');
  window.history.back();
  await waitForRenderFailure('a render failed');
  await settleTraversal();

  await expect.poll(() => window.location.pathname).toBe('/c');
  expect(renderedPath()).toBe('/c');
  expect(reloads).toBe(0);

  // Both entries the user traversed past are still behind them.
  holdB = false;
  failA = false;
  window.history.back();
  await expect.poll(renderedPath).toBe('/b');
  expect(window.location.pathname).toBe('/b');
  window.history.back();
  await expect.poll(renderedPath).toBe('/a');
  expect(window.location.pathname).toBe('/a');
});

test('should keep URL and page aligned when navigation follows a rollback', async () => {
  let failFlaky = false;
  startAt('/home');
  await createSPA({
    root,
    registry: createRouteRegistry(() => {
      route('/home', () => <Page path="/home" />);
      route('/flaky', () => {
        if (failFlaky) throw new Error('flaky render failed');
        return <Page path="/flaky" />;
      });
      route('/other', () => <Page path="/other" />);
    }),
  });
  navigate('/flaky');
  await expect.poll(renderedPath).toBe('/flaky');
  window.history.back();
  await expect.poll(renderedPath).toBe('/home');

  // Navigate before the rollback's traversal back to /home arrives.
  const go = window.history.go.bind(window.history);
  vi.spyOn(window.history, 'go').mockImplementationOnce((delta) => {
    go(delta);
    queueMicrotask(() => {
      failFlaky = false;
      navigate('/other');
    });
  });
  failFlaky = true;
  window.history.forward();
  await waitForRenderFailure('flaky render failed');
  await settleTraversal();

  await expect.poll(renderedPath).toBe(window.location.pathname);
  await settleTraversal();
  expect(renderedPath()).toBe(window.location.pathname);
});

test('should keep stamping history positions after a plain fragment link', async () => {
  startAt('/home');
  await createSPA({
    root,
    registry: createRouteRegistry(() => {
      route('/home', () => (
        <div>
          <Page path="/home" />
          <a href="#details">{'Details'}</a>
        </div>
      ));
      route('/next', () => <Page path="/next" />);
    }),
  });
  const start = window.history.state.askrIndex as number;

  await page.getByRole('link', { name: 'Details' }).click();
  await expect.poll(() => window.location.hash).toBe('#details');
  await settleTraversal();
  navigate('/next');
  await expect.poll(renderedPath).toBe('/next');

  expect(window.history.state.askrIndex).toBe(start + 2);
});

test('should reload instead of landing on the wrong entry after an external pushState', async () => {
  let failHome = false;
  startAt('/home');
  await createSPA({
    root,
    registry: createRouteRegistry(() => {
      route('/home', () => {
        if (failHome) throw new Error('home render failed');
        return <Page path="/home" />;
      });
      route('/external', () => <Page path="/external" />);
      route('/next', () => <Page path="/next" />);
    }),
  });

  // Written by code other than Askr, without a popstate.
  window.history.pushState({}, '', '/external');
  navigate('/next');
  await expect.poll(renderedPath).toBe('/next');

  failHome = true;
  window.history.go(-2);
  await waitForRenderFailure('home render failed');
  await settleTraversal();

  expect(reloads).toBe(1);
  expect(window.location.pathname).not.toBe('/external');
});

test('should return to the rendered entry when another app mounts during a failing traversal', async () => {
  let failA = false;
  let releaseA!: () => void;
  let holdA = false;
  startAt('/a');
  await createSPA({
    root,
    registry: createRouteRegistry(() => {
      route(
        '/a',
        () => {
          if (failA) throw new Error('a render failed');
          return <Page path="/a" />;
        },
        {
          loader: () =>
            holdA
              ? new Promise<string>((resolve) => {
                  releaseA = () => resolve('a');
                })
              : 'a',
        }
      );
      route('/b', () => <Page path="/b" />);
    }),
  });
  navigate('/b');
  await expect.poll(renderedPath).toBe('/b');

  holdA = true;
  failA = true;
  window.history.back();
  await expect.poll(() => window.location.pathname).toBe('/a');
  const second = document.body.appendChild(document.createElement('div'));
  try {
    await createSPA({
      root: second,
      registry: createRouteRegistry(() => {
        route('/a', () => <i>{'second app'}</i>);
        route('/b', () => <i>{'second app'}</i>);
      }),
    });
    releaseA();
    await waitForRenderFailure('a render failed');
    await settleTraversal();

    await expect.poll(() => window.location.pathname).toBe('/b');
    expect(renderedPath()).toBe('/b');
    expect(reloads).toBe(0);
  } finally {
    cleanupApp(second);
    second.remove();
  }
});

test('should not reload for a fragment link on a page no route matches', async () => {
  startAt('/nowhere');
  await createSPA({
    root,
    registry: createRouteRegistry(() => {
      route('/a', () => <Page path="/a" />);
    }),
  });
  const anchor = document.body.appendChild(document.createElement('a'));
  anchor.href = '#section';
  anchor.textContent = 'Section';
  try {
    await page.getByRole('link', { name: 'Section' }).click();
    await expect.poll(() => window.location.hash).toBe('#section');
    navigate('#details');
    await expect.poll(() => window.location.hash).toBe('#details');
    await settleTraversal();

    expect(reloads).toBe(0);
    expect(window.location.pathname).toBe('/nowhere');
  } finally {
    anchor.remove();
  }
});

test('should return to the rendered entry when a back/forward loader rejects', async () => {
  let rejectA = false;
  startAt('/a');
  await createSPA({
    root,
    registry: createRouteRegistry(() => {
      route('/a', () => <Page path="/a" />, {
        loader: () =>
          rejectA ? Promise.reject(new Error('a loader failed')) : 'a',
      });
      route('/b', () => <Page path="/b" />);
    }),
  });
  navigate('/b');
  await expect.poll(renderedPath).toBe('/b');

  rejectA = true;
  window.history.back();
  await waitForRenderFailure('a loader failed');
  await settleTraversal();

  await expect.poll(() => window.location.pathname).toBe('/b');
  expect(renderedPath()).toBe('/b');
  expect(reloads).toBe(0);

  // The /a entry is still behind the user.
  rejectA = false;
  window.history.back();
  await expect.poll(renderedPath).toBe('/a');
  expect(window.location.pathname).toBe('/a');
});
