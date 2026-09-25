import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';
import { page } from 'vite-plus/test/browser/context';
import { cleanupApp, createSPA } from '@askrjs/askr/boot';
import {
  Link,
  createRouteRegistry,
  navigate,
  redirect,
  route,
  to,
} from '@askrjs/askr/router';

// @askr-allow-real-timers -- browser navigations settle asynchronously.

type NavigateEventLike = Event & {
  navigationType: string;
  destination: { url: string };
};

let originalUrl = '';
let root: HTMLElement;
let errors: ReturnType<typeof vi.spyOn>;
let documentLoads: { type: string; url: string }[] = [];

let historyApiDepth = 0;
const originalPushState = window.history.pushState;
const originalReplaceState = window.history.replaceState;

// pushState/replaceState fire synchronous same-document navigate events.
function trackHistoryApi(
  method: typeof window.history.pushState
): typeof window.history.pushState {
  return function (this: History, ...args) {
    historyApiDepth += 1;
    try {
      return method.apply(this, args);
    } finally {
      historyApiDepth -= 1;
    }
  };
}

// A document load would unload the test runner; cancel and record it instead.
function cancelDocumentLoad(event: Event): void {
  const navigation = event as NavigateEventLike;
  if (historyApiDepth > 0 || navigation.navigationType === 'traverse') return;
  event.preventDefault();
  documentLoads.push({
    type: navigation.navigationType,
    url: navigation.destination.url,
  });
}

function browserNavigation(): EventTarget {
  const navigation = (window as Window & { navigation?: EventTarget })
    .navigation;
  if (!navigation) throw new Error('This browser lacks the Navigation API.');
  return navigation;
}

beforeEach(() => {
  documentLoads = [];
  window.history.pushState = trackHistoryApi(originalPushState);
  window.history.replaceState = trackHistoryApi(originalReplaceState);
  browserNavigation().addEventListener('navigate', cancelDocumentLoad);
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.body.appendChild(document.createElement('div'));
  originalUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
});

afterEach(() => {
  browserNavigation().removeEventListener('navigate', cancelDocumentLoad);
  window.history.pushState = originalPushState;
  window.history.replaceState = originalReplaceState;
  errors.mockRestore();
  cleanupApp(root);
  root.remove();
  window.history.replaceState({}, '', originalUrl);
});

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

test('should hand a cross-origin navigate() target to the browser', async () => {
  window.history.replaceState({}, '', '/home');
  await createSPA({
    root,
    registry: createRouteRegistry(() => {
      route('/home', () => <p>{'home page'}</p>);
      route('/x', () => <p>{'local x page'}</p>);
    }),
  });
  await expect.element(page.getByText('home page')).toBeVisible();

  navigate('https://other.example/x?q=1#top');
  await settle();

  expect(documentLoads).toEqual([
    { type: 'push', url: 'https://other.example/x?q=1#top' },
  ]);
  expect(window.location.pathname).toBe('/home');
  expect(root.textContent).toBe('home page');
});

test('should replace the document for a cross-origin navigate() with replace history', async () => {
  window.history.replaceState({}, '', '/home');
  await createSPA({
    root,
    registry: createRouteRegistry(() => {
      route('/home', () => <p>{'home page'}</p>);
    }),
  });

  navigate('https://other.example/x', { history: 'replace' });
  await settle();

  expect(documentLoads).toEqual([
    { type: 'replace', url: 'https://other.example/x' },
  ]);
  expect(window.location.pathname).toBe('/home');
});

test('should hand a cross-origin guard redirect to the browser', async () => {
  window.history.replaceState({}, '', '/home');
  await createSPA({
    root,
    registry: createRouteRegistry(() => {
      route('/home', () => <p>{'home page'}</p>);
      route('/login', () => <p>{'local login page'}</p>);
      route('/private', () => <p>{'private page'}</p>, {
        policies: [() => redirect('https://sso.example/login')],
      });
    }),
  });

  navigate('/private');
  await settle();

  expect(documentLoads).toEqual([
    { type: 'replace', url: 'https://sso.example/login' },
  ]);
  expect(window.location.pathname).toBe('/home');
  expect(root.textContent).toBe('home page');
});

test('should commit a navigation whose hash is not valid percent-encoding', async () => {
  window.history.replaceState({}, '', '/home');
  await createSPA({
    root,
    registry: createRouteRegistry(() => {
      route('/home', () => <p>{'home page'}</p>);
      route('/docs', () => <p id="%E0">{'docs page'}</p>);
    }),
  });

  navigate('/docs#%E0');
  await expect.element(page.getByText('docs page')).toBeVisible();
  await settle();

  expect(`${window.location.pathname}${window.location.hash}`).toBe(
    '/docs#%E0'
  );
  expect(errors).not.toHaveBeenCalled();
});

test('should treat navigate() paths as logical below a basePath', async () => {
  window.history.replaceState({}, '', '/app/');
  const registry = createRouteRegistry(
    () => {
      route('/', () => <p>{'home page'}</p>);
      route('/settings', () => <p>{'settings page'}</p>);
      route('/app/settings', () => <p>{'nested app settings page'}</p>);
    },
    { basePath: '/app' }
  );
  await createSPA({ root, registry });
  await expect.element(page.getByText('home page')).toBeVisible();

  navigate('/app/settings');

  await expect
    .element(page.getByText('nested app settings page'))
    .toBeVisible();
  expect(window.location.pathname).toBe('/app/app/settings');
});

test('should not prefix a typed destination twice below a basePath', async () => {
  window.history.replaceState({}, '', '/app/');
  let nested!: ReturnType<typeof route>;
  let settings!: ReturnType<typeof route>;
  const registry = createRouteRegistry(
    () => {
      route('/', () => (
        <div>
          <Link href="/app/settings">{'Raw nested'}</Link>
          <Link to={to(settings, {})}>{'Typed settings'}</Link>
          <Link to={to(nested, {})}>{'Typed nested'}</Link>
        </div>
      ));
      settings = route('/settings', () => <p>{'settings page'}</p>);
      nested = route('/app/settings', () => (
        <p>{'nested app settings page'}</p>
      ));
    },
    { basePath: '/app' }
  );
  await createSPA({ root, registry });

  await expect
    .element(page.getByRole('link', { name: 'Raw nested' }))
    .toHaveAttribute('href', '/app/app/settings');
  await expect
    .element(page.getByRole('link', { name: 'Typed settings' }))
    .toHaveAttribute('href', '/app/settings');
  await expect
    .element(page.getByRole('link', { name: 'Typed nested' }))
    .toHaveAttribute('href', '/app/app/settings');

  await page.getByRole('link', { name: 'Typed nested' }).click();
  await expect
    .element(page.getByText('nested app settings page'))
    .toBeVisible();
  expect(window.location.pathname).toBe('/app/app/settings');

  navigate(to(settings, {}));
  await expect.element(page.getByText('settings page')).toBeVisible();
  expect(window.location.pathname).toBe('/app/settings');
  expect(documentLoads).toEqual([]);
});

test('should intercept a Link whose target is _self', async () => {
  window.history.replaceState({}, '', '/home');
  await createSPA({
    root,
    registry: createRouteRegistry(() => {
      route('/home', () => (
        <Link href="/next" target="_self">
          {'Next'}
        </Link>
      ));
      route('/next', () => <p>{'next page'}</p>);
    }),
  });

  await page.getByRole('link', { name: 'Next' }).click();

  await expect.element(page.getByText('next page')).toBeVisible();
  expect(window.location.pathname).toBe('/next');
  expect(documentLoads).toEqual([]);
});

test('should leave a Link that targets another browsing context to the browser', async () => {
  window.history.replaceState({}, '', '/home');
  await createSPA({
    root,
    registry: createRouteRegistry(() => {
      route('/home', () => (
        <Link href="/next" target="named-frame">
          {'Next'}
        </Link>
      ));
      route('/next', () => <p>{'next page'}</p>);
    }),
  });
  let prevented: boolean | undefined;
  root.addEventListener('click', (event) => {
    prevented = event.defaultPrevented;
    event.preventDefault();
  });

  await page.getByRole('link', { name: 'Next' }).click();
  await settle();

  expect(prevented).toBe(false);
  expect(window.location.pathname).toBe('/home');
});
