import { expect, test, vi } from 'vite-plus/test';
import { userEvent } from 'vite-plus/test/browser';
import { requireUser } from '@askrjs/auth';
import { cleanupApp, createSPA } from '@askrjs/askr/boot';
import { createQuery, defineQuery, type Query } from '@askrjs/askr/data';
import {
  createRouteRegistry,
  createSessionAuth,
  currentAuth,
  route,
} from '@askrjs/askr/router';
import { flush } from '@askrjs/askr/testing';

async function settle(): Promise<void> {
  for (let index = 0; index < 20; index++) {
    await Promise.resolve();
    flush();
  }
}
const user = (id: string) => ({
  authenticated: true,
  principal: { id, subject: id },
  tenant: null,
  scopes: ['openid'],
});

test('should erase native private DOM and retained query data before a pending logout response', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  const before = location.href;
  history.replaceState({}, '', '/session-private');
  let release!: (value: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const auth = createSessionAuth({
    fetch: async (input) =>
      (input as Request).method === 'POST'
        ? pending
        : Response.json(user('native')),
  });
  let handle!: Query<string>;
  let operation: Promise<void> | undefined;
  const privateQuery = defineQuery({
    key: () => 'native:private',
    fetch: async () => 'private',
  });
  const registry = createRouteRegistry(
    () => {
      route(
        '/session-private',
        () => {
          handle = createQuery(privateQuery, {});
          return (
            <button
              onClick={() => {
                operation = auth.logout();
              }}
            >
              Sign out {currentAuth().principal?.id}:{handle.data}
            </button>
          );
        },
        { auth: requireUser() }
      );
      route('/login', () => <main>login</main>);
    },
    { auth }
  );
  try {
    await createSPA({ root, registry });
    await settle();
    await userEvent.click(root.querySelector('button')!);
    expect(root.textContent).toBe('');
    expect(handle.data).toBeNull();
    expect(handle.error).toMatchObject({ name: 'AbortError' });
    expect(handle.loading).toBe(false);
    expect(handle.refreshing).toBe(false);
    release(new Response(null, { status: 204 }));
    await operation;
    await settle();
    expect(root.textContent).toBe('login');
    expect(location.pathname).toBe('/login');
  } finally {
    cleanupApp(root);
    root.remove();
    history.replaceState({}, '', before);
  }
});

test('should treat a delayed native cross-tab logout as a hint and revalidate the newer server identity', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  const before = location.href;
  history.replaceState({}, '', '/session-private');
  const transport = vi
    .fn()
    .mockResolvedValueOnce(Response.json(user('old')))
    .mockResolvedValueOnce(Response.json(user('new')));
  const auth = createSessionAuth({ fetch: transport });
  const registry = createRouteRegistry(
    () =>
      route('/session-private', () => (
        <main>{currentAuth().principal?.id}</main>
      )),
    { auth }
  );
  const channel = new BroadcastChannel('askr:provider-session:1');
  try {
    await createSPA({ root, registry });
    expect(root.textContent).toBe('old');
    channel.postMessage({
      protocol: 1,
      kind: 'logout',
      nonce: 'delayed-old-session',
    });
    await expect.poll(() => root.textContent).toBe('new');
    expect(transport).toHaveBeenCalledTimes(2);
  } finally {
    channel.close();
    cleanupApp(root);
    root.remove();
    history.replaceState({}, '', before);
  }
});
