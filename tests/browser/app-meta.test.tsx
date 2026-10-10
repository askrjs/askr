import { afterEach, expect, test, vi } from 'vite-plus/test';
import { cleanupApp, createSPA } from '@askrjs/askr/boot';
import {
  createDataRuntime,
  createQuery,
  disposeDataRuntime,
  type Query,
} from '@askrjs/askr/data';
import {
  createRouteRegistry,
  currentRoute,
  group,
  lazy,
  page,
  route,
  Outlet,
  navigate,
} from '@askrjs/askr/router';

interface AppMeta {
  requiredGrants?: readonly string[];
  label?: string;
}
const roots: HTMLElement[] = [];
const originalUrl = window.location.href;
afterEach(() => {
  for (const root of roots.splice(0)) {
    cleanupApp(root);
    root.remove();
  }
  window.history.replaceState({}, '', originalUrl);
  vi.restoreAllMocks();
});
function root() {
  const host = document.body.appendChild(document.createElement('div'));
  roots.push(host);
  return host;
}

test('should react to unresolved, failed, inherited and revoked grants while the route stays active', async () => {
  const runtime = createDataRuntime();
  let grants!: Query<{ grants: string[] }>;
  const requests: {
    resolve: (data: { grants: string[] }) => void;
    reject: (error: Error) => void;
  }[] = [];
  const fetch = () =>
    new Promise<{ grants: string[] }>((resolve, reject) =>
      requests.push({ resolve, reject })
    );
  const host = root();
  window.history.replaceState({}, '', '/reports/42');
  const registry = createRouteRegistry(() => {
    group({ appMeta: { requiredGrants: ['app:read'] } }, () => {
      page(
        '/reports',
        () => <Outlet />,
        { appMeta: { requiredGrants: ['reports:read'] } },
        () => {
          route(
            '{id}',
            () => {
              const active = currentRoute<{ id: string }, unknown, AppMeta>();
              grants = createQuery({ key: 'session:grants', fetch });
              const requirements = active.matches.flatMap(
                (entry) => entry.appMeta?.requiredGrants ?? []
              );
              const status =
                grants.loading || grants.refreshing
                  ? 'unresolved'
                  : grants.error
                    ? 'failed'
                    : requirements.every((grant) =>
                          grants.data?.grants.includes(grant)
                        )
                      ? 'allowed'
                      : 'denied';
              return (
                <main data-status={status} data-id={active.params.id}>
                  {status === 'allowed' ? 'Report content' : status}
                </main>
              );
            },
            { appMeta: { requiredGrants: ['report:read'] } }
          );
        }
      );
    });
  });
  try {
    await createSPA({ root: host, registry, dataRuntime: runtime });
    await expect
      .poll(() => host.querySelector('main')?.dataset.status)
      .toBe('unresolved');
    await expect.poll(() => requests.length).toBe(1);
    requests[0].reject(new Error('grants unavailable'));
    await expect
      .poll(() => host.querySelector('main')?.dataset.status)
      .toBe('failed');
    let refresh = grants.refresh();
    await expect.poll(() => requests.length).toBe(2);
    requests[1].resolve({ grants: ['report:read'] });
    await refresh;
    await expect
      .poll(() => host.querySelector('main')?.dataset.status)
      .toBe('denied');
    refresh = grants.refresh();
    await expect.poll(() => requests.length).toBe(3);
    requests[2].resolve({
      grants: ['app:read', 'reports:read', 'report:read'],
    });
    await refresh;
    await expect.poll(() => host.textContent).toBe('Report content');
    refresh = grants.refresh();
    await expect
      .poll(() => host.querySelector('main')?.dataset.status)
      .toBe('unresolved');
    await expect.poll(() => requests.length).toBe(4);
    requests[3].resolve({ grants: ['app:read', 'reports:read'] });
    await refresh;
    await expect
      .poll(() => host.querySelector('main')?.dataset.status)
      .toBe('denied');
    expect(window.location.pathname).toBe('/reports/42');
    expect(host.querySelector('main')?.dataset.id).toBe('42');
  } finally {
    cleanupApp(host);
    disposeDataRuntime(runtime);
  }
});

test('should keep metadata reads owned by each mounted registry across navigation', async () => {
  const first = root();
  const second = root();
  const build = (label: string) =>
    createRouteRegistry(() => {
      group({ appMeta: { label } }, () => {
        route('/items/{id}', () => {
          const active = currentRoute<{ id: string }, unknown, AppMeta>();
          return (
            <p>{`${active.matches[0].appMeta?.label}:${active.params.id}`}</p>
          );
        });
      });
    });
  window.history.replaceState({}, '', '/items/1');
  await createSPA({ root: first, registry: build('First') });
  await createSPA({ root: second, registry: build('Second') });
  expect(first.textContent).toBe('First:1');
  expect(second.textContent).toBe('Second:1');
  navigate('/items/2');
  await expect.poll(() => first.textContent).toBe('First:2');
  await expect.poll(() => second.textContent).toBe('Second:2');
});

test('should retain declaration ancestry and dynamic params through a lazy route', async () => {
  const host = root();
  const loaded = lazy(async () => ({
    default: () => {
      const active = currentRoute<{ id: string }, unknown, AppMeta>();
      return (
        <p>{`${active.params.id}|${active.matches.map((entry) => entry.appMeta?.label).join('/')}`}</p>
      );
    },
  }));
  const registry = createRouteRegistry(() => {
    group({ appMeta: { label: 'Parent' } }, () => {
      route('/lazy/{id}', loaded, { appMeta: { label: 'Lazy' } });
    });
  });
  window.history.replaceState({}, '', '/lazy/42');
  await createSPA({ root: host, registry });
  await expect.poll(() => host.textContent).toBe('42|Parent/Lazy');
});
