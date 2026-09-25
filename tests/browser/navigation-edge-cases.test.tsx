import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
  vi,
} from 'vite-plus/test';
import { page } from 'vite-plus/test/browser/context';
import { requireUser } from '@askrjs/auth';
import { cleanupApp, createSPA } from '@askrjs/askr/boot';
import {
  Link,
  createRouteRegistry,
  navigate,
  redirect,
  updateRouteQuery,
  route,
  to,
} from '@askrjs/askr/router';

// @askr-allow-real-timers -- browser navigations settle asynchronously.

// WebKit throws SecurityError after 100 history.pushState/replaceState calls
// in 10 seconds. Cases share one app where they can, the URL is restored once
// per file, and the file's own write count is checked below. The browser
// setup spaces tests across files when the shared runner page nears its quota.
const HISTORY_WRITE_BUDGET = 45;

type NavigateEventLike = Event & {
  navigationType: string;
  destination: { url: string };
};

let originalUrl = '';
let root: HTMLElement;
let errors: ReturnType<typeof vi.spyOn>;
let documentLoads: { type: string; url: string }[] = [];

let historyApiDepth = 0;
let historyWrites = 0;
const originalPushState = window.history.pushState;
const originalReplaceState = window.history.replaceState;

// pushState/replaceState fire synchronous same-document navigate events.
function trackHistoryApi(
  method: typeof window.history.pushState
): typeof window.history.pushState {
  return function (this: History, ...args) {
    historyApiDepth += 1;
    historyWrites += 1;
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

beforeAll(() => {
  originalUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
});

afterAll(() => {
  window.history.replaceState({}, '', originalUrl);
  expect(historyWrites).toBeLessThanOrEqual(HISTORY_WRITE_BUDGET);
});

beforeEach(() => {
  documentLoads = [];
  window.history.pushState = trackHistoryApi(originalPushState);
  window.history.replaceState = trackHistoryApi(originalReplaceState);
  browserNavigation().addEventListener('navigate', cancelDocumentLoad);
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  root = document.body.appendChild(document.createElement('div'));
});

afterEach(() => {
  browserNavigation().removeEventListener('navigate', cancelDocumentLoad);
  window.history.pushState = originalPushState;
  window.history.replaceState = originalReplaceState;
  errors.mockRestore();
  cleanupApp(root);
  root.remove();
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

const PATH_LIKE_CROSS_ORIGIN = [
  '/\\evil.example/x',
  '/\t/evil.example/x',
  '\\\\evil.example/x',
  ' //evil.example/x',
  '//evil.example/x',
];

const DOT_SEGMENT_CROSS_ORIGIN = [
  '/.//evil.example/x',
  '/x/..//evil.example/x',
  '/..//evil.example',
  '/%2e//evil.example',
  '/%2E%2E//evil.example',
  '/./\\evil.example',
];

test('should refuse navigate() targets that resolve to another origin without an explicit scheme', async () => {
  window.history.replaceState({}, '', '/home');
  await createSPA({
    root,
    registry: createRouteRegistry(() => {
      route('/home', () => <p>{'home page'}</p>);
    }),
  });
  const writesBefore = historyWrites;

  for (const target of [
    ...PATH_LIKE_CROSS_ORIGIN,
    ...DOT_SEGMENT_CROSS_ORIGIN,
  ]) {
    expect(() => navigate(target), target).toThrow(TypeError);
  }
  await settle();

  expect(documentLoads).toEqual([]);
  expect(historyWrites).toBe(writesBefore);
  expect(window.location.pathname).toBe('/home');
  expect(root.textContent).toBe('home page');
});

test('should refuse Link hrefs that resolve to another origin without an explicit scheme', () => {
  for (const href of [...PATH_LIKE_CROSS_ORIGIN, ...DOT_SEGMENT_CROSS_ORIGIN]) {
    expect(() => Link({ href, children: 'Evil' }), href).toThrow(TypeError);
  }
});

test('should write history once per navigation plus the departing scroll position', async () => {
  window.history.replaceState({}, '', '/home');
  await createSPA({
    root,
    registry: createRouteRegistry(() => {
      route('/home', () => <p>{'home page'}</p>);
      route('/next', () => <p>{'next page'}</p>);
    }),
  });
  const writesBefore = historyWrites;

  navigate('/next');
  await expect.element(page.getByText('next page')).toBeVisible();

  // One pushState for the entry and one replaceState saving the scroll
  // position of the entry being left.
  expect(historyWrites - writesBefore).toBe(2);
});

test('should refuse a path-like guard redirect that resolves to another origin', async () => {
  window.history.replaceState({}, '', '/home');
  await createSPA({
    root,
    registry: createRouteRegistry(() => {
      route('/home', () => <p>{'home page'}</p>);
      route('/private', () => <p>{'private page'}</p>, {
        policies: [() => redirect('/\\evil.example/login')],
      });
    }),
  });

  expect(() => navigate('/private')).toThrow(TypeError);
  await settle();

  expect(documentLoads).toEqual([]);
  expect(window.location.pathname).toBe('/home');
});

test('should load an explicit uppercase HTTPS target on another origin', async () => {
  window.history.replaceState({}, '', '/home');
  await createSPA({
    root,
    registry: createRouteRegistry(() => {
      route('/home', () => <p>{'home page'}</p>);
    }),
  });

  navigate(' HTTPS://other.example/x');
  await settle();

  expect(documentLoads).toEqual([
    { type: 'push', url: 'https://other.example/x' },
  ]);
});

test('should redirect to a typed destination below a basePath without prefixing it again', async () => {
  window.history.replaceState({}, '', '/app/');
  let settings!: ReturnType<typeof route>;
  let login!: ReturnType<typeof route>;
  const registry = createRouteRegistry(
    () => {
      route('/', () => <p>{'home page'}</p>);
      settings = route('/settings', () => <p>{'settings page'}</p>);
      login = route('/login', () => <p>{'login page'}</p>);
      route('/old-settings', () => null, {
        policies: [() => redirect(to(settings, {}))],
      });
      route('/account', () => <p>{'account page'}</p>, {
        auth: requireUser(),
      });
    },
    {
      basePath: '/app',
      auth: { loginPath: () => to(login, {}) },
    }
  );
  await createSPA({ root, registry });
  await expect.element(page.getByText('home page')).toBeVisible();

  navigate('/old-settings');
  await expect.element(page.getByText('settings page')).toBeVisible();
  expect(window.location.pathname).toBe('/app/settings');

  navigate('/account');
  await expect.element(page.getByText('login page')).toBeVisible();
  expect(`${window.location.pathname}${window.location.search}`).toBe(
    '/app/login?next=%2Faccount'
  );
});

test('should warn in development when a string target already starts with the basePath', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    window.history.replaceState({}, '', '/app/');
    const registry = createRouteRegistry(
      () => {
        route('/', () => (
          <div>
            <Link href="/app">{'Doubled home'}</Link>
            <Link href="/apple">{'Apple'}</Link>
          </div>
        ));
        route('/app/settings', () => <p>{'nested app settings page'}</p>);
        route('/apple', () => <p>{'apple page'}</p>);
        route('/old', () => null, {
          policies: [() => redirect('/app/settings')],
        });
      },
      { basePath: '/app' }
    );
    await createSPA({ root, registry });
    await expect
      .element(page.getByRole('link', { name: 'Apple' }))
      .toBeVisible();
    const warnings = () =>
      warn.mock.calls.map((call) => call.map(String).join(' '));

    expect(warnings().filter((w) => w.includes('basePath'))).toEqual([
      expect.stringContaining('"/app"'),
    ]);

    warn.mockClear();
    navigate('/app/settings');
    await expect
      .element(page.getByText('nested app settings page'))
      .toBeVisible();
    expect(warnings()).toEqual([expect.stringContaining('"/app/settings"')]);

    warn.mockClear();
    navigate('/old');
    await expect.poll(() => window.location.pathname).toBe('/app/app/settings');
    expect(warnings().some((w) => w.includes('"/app/settings"'))).toBe(true);
  } finally {
    warn.mockRestore();
  }
});

test('should hand a cross-origin redirect on first load to the browser', async () => {
  window.history.replaceState({}, '', '/private');
  await createSPA({
    root,
    registry: createRouteRegistry(() => {
      route('/login', () => <p>{'local login page'}</p>);
      route('/private', () => <p>{'private page'}</p>, {
        policies: [() => redirect('https://auth.example/login')],
      });
    }),
  });
  await settle();

  expect(documentLoads).toEqual([
    { type: 'replace', url: 'https://auth.example/login' },
  ]);
  expect(window.location.pathname).toBe('/private');
  expect(root.textContent).not.toContain('local login page');
});

test('should refuse a path-like cross-origin redirect on first load', async () => {
  window.history.replaceState({}, '', '/private');
  await expect(
    createSPA({
      root,
      registry: createRouteRegistry(() => {
        route('/evil.example/x', () => <p>{'in-app evil page'}</p>);
        route('/private', () => <p>{'private page'}</p>, {
          policies: [() => ({ kind: 'redirect', to: '/\\evil.example/x' })],
        });
      }),
    })
  ).rejects.toThrow(TypeError);
  await settle();

  expect(documentLoads).toEqual([]);
  expect(window.location.pathname).toBe('/private');
  expect(root.textContent).not.toContain('in-app evil page');
});

test('should refuse a first-load redirect whose dot segments leave the origin', async () => {
  window.history.replaceState({}, '', '/private');
  await expect(
    createSPA({
      root,
      registry: createRouteRegistry(() => {
        route('/private', () => <p>{'private page'}</p>, {
          policies: [() => ({ kind: 'redirect', to: '/.//evil.example/x' })],
        });
      }),
    })
  ).rejects.toThrow(TypeError);
  await settle();

  expect(documentLoads).toEqual([]);
  expect(window.location.pathname).toBe('/private');
});

test('should keep a Link click to an empty leading segment on the origin', async () => {
  window.history.replaceState({}, '', '/home');
  await createSPA({
    root,
    registry: createRouteRegistry(() => {
      route('/home', () => <Link href="/a//b">{'Double slash'}</Link>);
    }),
  });

  await page.getByRole('link', { name: 'Double slash' }).click();
  await settle();

  expect(documentLoads).toEqual([
    { type: 'push', url: `${window.location.origin}/a//b` },
  ]);
});

test.each(['java\nscript:alert(1)', ' javascript:alert(1)', 'jav\tascript:x'])(
  'should reject control-character script scheme %j in navigate() and Link alike',
  async (target) => {
    expect(() => navigate(target)).toThrow(TypeError);
    expect(() => Link({ href: target, children: 'x' })).toThrow(TypeError);
  }
);

test('should keep a query update on a //-prefixed pathname on the origin', async () => {
  const origin = window.location.origin;
  window.history.replaceState({}, '', `${origin}//evil.example/x`);
  expect(window.location.pathname).toBe('//evil.example/x');

  updateRouteQuery({ q: '1' }, { history: 'push' });

  expect(window.location.origin).toBe(origin);
  expect(`${window.location.pathname}${window.location.search}`).toBe(
    '//evil.example/x?q=1'
  );
  expect(documentLoads).toEqual([]);
});
