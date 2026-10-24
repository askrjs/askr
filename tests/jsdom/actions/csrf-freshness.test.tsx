import { resetRouterState } from '../../../src/router/reset';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { schema } from '@askrjs/schema';
import { action, defineAction } from '../../../src/actions';
import { cleanupApp, createIsland, hydrateSPA } from '../../../src/boot';
import { createRouteRegistry, route } from '../../../src/router';
import { renderToStringSync } from '../../../src/ssr';
import { createPageRenderEnvelope } from '../../../src/common/page-render-envelope';
import { revokeHydratedCsrfToken } from '../../../src/common/csrf-token';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

const save = defineAction({
  id: 'csrf-freshness-save',
  input: schema.object({ name: schema.string() }),
});
type Command = ReturnType<typeof action<{ name: string }, unknown>>;
type Options = Parameters<typeof action>[1];

function post() {
  const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
    Response.json({ result: { ok: true } })
  );
  vi.stubGlobal('fetch', request);
  const tokens = () =>
    request.mock.calls.map((call) =>
      new Headers(call[1]?.headers).get('x-askr-csrf-token')
    );
  return { request, tokens };
}

function setMeta(content: string | null) {
  document.head.querySelector('meta[name="csrf-token"]')?.remove();
  if (content === null) return;
  const meta = document.createElement('meta');
  meta.setAttribute('name', 'csrf-token');
  meta.setAttribute('content', content);
  document.head.append(meta);
}

function setCookie(name: string, value: string | null) {
  document.cookie =
    value === null
      ? `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
      : `${name}=${value}; path=/`;
}

describe('action CSRF freshness', () => {
  let view = createTestContainer();
  beforeEach(() => {
    view = createTestContainer();
    Reflect.deleteProperty(globalThis, Symbol.for('__ASKR_EXECUTION_MODEL__'));
    resetRouterState();
    window.history.replaceState({}, '', '/');
  });
  afterEach(() => {
    cleanupApp(view.container);
    view.cleanup();
    setMeta(null);
    setCookie('XSRF-TOKEN', null);
    vi.unstubAllGlobals();
    Reflect.deleteProperty(globalThis, Symbol.for('__ASKR_EXECUTION_MODEL__'));
  });

  function mount(options?: Options) {
    let command!: Command;
    createIsland({
      root: view.container,
      component: () => {
        command = action<{ name: string }, unknown>(save, options);
        return <p>{command.state().pending ? 'pending' : 'ready'}</p>;
      },
    });
    return () => command;
  }

  it('should read a rotated csrf-token meta element on every submit', async () => {
    const { tokens } = post();
    const command = mount();
    setMeta('first');
    await command().submit({ name: 'a' });
    setMeta('second');
    await command().submit({ name: 'b' });
    expect(tokens()).toEqual(['first', 'second']);
  });

  it('should send no token when no source has one', async () => {
    const { tokens } = post();
    const command = mount();
    await command().submit({ name: 'a' });
    expect(tokens()).toEqual([null]);
  });

  it('should ignore a meta token that is not a valid header value', async () => {
    const { tokens } = post();
    const command = mount();
    setMeta('has space');
    await command().submit({ name: 'a' });
    expect(tokens()).toEqual([null]);
  });

  it('should read the cookie named by csrfCookie at every submit and decode it', async () => {
    const { tokens } = post();
    const command = mount({ csrfCookie: 'XSRF-TOKEN' });
    setCookie('XSRF-TOKEN', 'one%3Dtwo');
    await command().submit({ name: 'a' });
    setCookie('XSRF-TOKEN', 'rotated');
    await command().submit({ name: 'b' });
    expect(tokens()).toEqual(['one=two', 'rotated']);
  });

  it('should prefer the meta element over the cookie and ignore an unnamed cookie', async () => {
    const { tokens } = post();
    setCookie('XSRF-TOKEN', 'from-cookie');
    const withoutName = mount();
    await withoutName().submit({ name: 'a' });
    cleanupApp(view.container);
    const named = mount({ csrfCookie: 'XSRF-TOKEN' });
    setMeta('from-meta');
    await named().submit({ name: 'b' });
    expect(tokens()).toEqual([null, 'from-meta']);
  });

  it('should keep an explicit resolver ahead of every other source', async () => {
    const { tokens } = post();
    setMeta('from-meta');
    const command = mount({ csrfToken: async () => 'from-resolver' });
    await command().submit({ name: 'a' });
    expect(tokens()).toEqual(['from-resolver']);
  });

  it('should reject an invalid csrfCookie option', () => {
    expect(() => action(save, { csrfCookie: '' })).toThrow('csrfCookie');
    expect(() => action(save, { csrfCookie: 'a;b' })).toThrow('csrfCookie');
    expect(() => action(save, { csrfToken: 'x' } as never)).toThrow(
      'csrfToken'
    );
    expect(() => action(save, { other: 1 } as never)).toThrow('csrfToken');
  });

  async function hydrate(token: string) {
    let command!: Command;
    const Page = () => {
      command = action<{ name: string }, unknown>(save);
      return <p>{command.state().pending ? 'pending' : 'page'}</p>;
    };
    view.container.innerHTML = renderToStringSync(
      Page,
      {},
      {
        envelope: createPageRenderEnvelope({ framework: { csrf: token } }),
      }
    );
    await hydrateSPA({
      root: view.container,
      registry: createRouteRegistry(() => {
        route('/', Page);
      }),
    });
    return () => command;
  }

  it('should use the hydration token ahead of a meta element until the identity changes', async () => {
    const { tokens } = post();
    const command = await hydrate('hydrated');
    setMeta('meta-token');
    await command().submit({ name: 'a' });
    revokeHydratedCsrfToken();
    await command().submit({ name: 'b' });
    setMeta('rotated-after-login');
    await command().submit({ name: 'c' });
    expect(tokens()).toEqual(['hydrated', 'meta-token', 'rotated-after-login']);
  });
});
