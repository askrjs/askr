import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { schema } from '@askrjs/schema';
import { createSPA } from '@askrjs/askr/boot';
import { action, defineAction } from '../../../src/actions';
import { createRouteRegistry, route } from '../../../src/router/route';
import { resetRouteState } from '../../router-test-utils';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

const signIn = defineAction({
  id: 'sign-in',
  input: schema.object({ name: schema.string() }),
  invalidates: [],
});

describe('action redirects in a routed app', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('should follow a same-origin redirect through the router instead of a document load', async () => {
    const { loadDocument } =
      await import('../../../src/router/document-navigation');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          version: 1,
          ok: true,
          result: { ok: true },
          redirect: `${window.location.origin}/welcome?from=sign-in`,
        })
      )
    );
    let submit!: () => Promise<unknown>;
    const registry = createRouteRegistry(() => {
      route('/', () => {
        const command = action<{ name: string }, { ok: boolean }>(signIn);
        submit = () => command.submit({ name: 'Ada' });
        return <p>{command.state().pending ? 'pending' : 'sign in'}</p>;
      });
      route('/welcome', () => <p>welcome</p>);
    });
    await createSPA({ root: container, registry });
    const length = window.history.length;

    await submit();
    await vi.waitFor(() => expect(container.textContent).toBe('welcome'));
    expect(window.location.pathname + window.location.search).toBe(
      '/welcome?from=sign-in'
    );
    expect(window.history.length).toBe(length + 1);
    expect(loadDocument).not.toHaveBeenCalled();
  });
});
