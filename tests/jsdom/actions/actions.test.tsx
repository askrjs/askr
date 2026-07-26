import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  action,
  ActionForm,
  defineAction,
  type ActionStatus,
} from '../../../src/actions';
import { getDefaultDataRuntime } from '../../../src/data';
import { schema } from '@askrjs/schema';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../../test-utils/render/test-renderer';
import { renderToStringSync } from '../../../src/ssr';
import { createPageRenderEnvelope } from '../../../src/common/page-render-envelope';

const save = defineAction({
  id: 'save-item',
  input: schema.object({ name: schema.string() }),
  invalidates: ['items:'],
});

afterEach(() => {
  vi.unstubAllGlobals();
  getDefaultDataRuntime().queryData.clear();
});

describe('actions', () => {
  it('should emit CSRF and expose native replay given scoped SSR action data', () => {
    let status: ActionStatus | undefined;
    const replay = {
      kind: 'invalid',
      action: save.id,
      values: { name: 'x' },
      issues: [{ path: ['name'], code: 'too_small', message: 'Too short.' }],
      fieldErrors: { name: ['Too short.'] },
    } as const;
    const App = () => {
      const command = action(save);
      status = command.state();
      return (
        <ActionForm action={save}>
          <input name="name" />
        </ActionForm>
      );
    };
    const html = renderToStringSync(
      App,
      {},
      {
        envelope: createPageRenderEnvelope({
          framework: { csrf: 'signed-token', action: replay },
        }),
      }
    );
    expect(html).toContain('name="_csrf" value="signed-token"');
    expect(status?.error).toEqual(replay);
  });

  it('should invalidate enhanced envelope prefixes without navigating', async () => {
    getDefaultDataRuntime().queryData.set('items:one', { id: 'one' });
    getDefaultDataRuntime().queryData.set('other:one', { id: 'one' });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              version: 1,
              ok: true,
              result: { saved: true },
              invalidates: ['items:'],
            }),
            { headers: { 'content-type': 'application/json' } }
          )
      )
    );
    const assign = vi.fn();
    vi.stubGlobal('location', { href: 'http://example.test/items', assign });
    let command!: ReturnType<
      typeof action<{ name: string }, { saved: boolean }>
    >;
    const App = () => {
      command = action<{ name: string }, { saved: boolean }>(save);
      return <div>{command.state().pending ? 'pending' : 'idle'}</div>;
    };
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await command.submit({ name: 'Ada' });
      await waitForNextEvaluation();
      flushScheduler();
      expect(getDefaultDataRuntime().queryData.has('items:one')).toBe(false);
      expect(getDefaultDataRuntime().queryData.has('other:one')).toBe(true);
      expect(command.state()).toEqual({
        pending: false,
        result: { saved: true },
      });
      expect(assign).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });

  it('should navigate only after enhanced result state and invalidations are processed', async () => {
    getDefaultDataRuntime().queryData.set('items:one', { id: 'one' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          version: 1,
          ok: true,
          result: { saved: true },
          invalidates: ['items:'],
          redirect: '/signed-in',
        })
      )
    );
    let command!: ReturnType<
      typeof action<{ name: string }, { saved: boolean }>
    >;
    const assign = vi.fn(() => {
      expect(getDefaultDataRuntime().queryData.has('items:one')).toBe(false);
      expect(command.state()).toEqual({
        pending: false,
        result: { saved: true },
      });
    });
    vi.stubGlobal('location', {
      href: 'http://example.test/items',
      assign,
    });
    const App = () => {
      command = action<{ name: string }, { saved: boolean }>(save);
      return <div>{command.state().pending ? 'pending' : 'idle'}</div>;
    };
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await expect(command.submit({ name: 'Ada' })).resolves.toEqual({
        saved: true,
      });
      expect(assign).toHaveBeenCalledOnce();
      expect(assign).toHaveBeenCalledWith('/signed-in');
    } finally {
      cleanup();
    }
  });

  it.each([
    'https://attacker.test/phish',
    '//attacker.test/phish',
    'javascript:alert(1)',
    'data:text/html,phish',
  ])('should reject unsafe enhanced action redirect %s', async (redirect) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          version: 1,
          ok: true,
          result: { saved: true },
          redirect,
        })
      )
    );
    const assign = vi.fn();
    vi.stubGlobal('location', {
      href: 'http://example.test/items',
      assign,
    });
    let command!: ReturnType<
      typeof action<{ name: string }, { saved: boolean }>
    >;
    const App = () => {
      command = action<{ name: string }, { saved: boolean }>(save);
      return <div />;
    };
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await expect(command.submit({ name: 'Ada' })).rejects.toThrow(
        'must stay on the current origin'
      );
      expect(assign).not.toHaveBeenCalled();
      expect(command.state().error).toBeInstanceOf(TypeError);
    } finally {
      cleanup();
    }
  });

  it('should put enhanced 422 field errors into reactive error state', async () => {
    const failure = {
      version: 1,
      ok: false,
      kind: 'invalid',
      action: save.id,
      values: { name: 'x' },
      issues: [{ path: ['name'], code: 'too_small', message: 'Too short.' }],
      fieldErrors: { name: ['Too short.'] },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(failure), {
            status: 422,
            headers: { 'content-type': 'application/json' },
          })
      )
    );
    const assign = vi.fn();
    vi.stubGlobal('location', { href: 'http://example.test/items', assign });
    let command!: ReturnType<typeof action<{ name: string }>>;
    const App = () => {
      command = action(save);
      return <div>{command.state().error ? 'invalid' : 'valid'}</div>;
    };
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await expect(command.submit({ name: 'x' })).rejects.toMatchObject({
        kind: 'invalid',
        fieldErrors: { name: ['Too short.'] },
      });
      await waitForNextEvaluation();
      flushScheduler();
      expect(command.state().error).toMatchObject({
        kind: 'invalid',
        values: { name: 'x' },
        fieldErrors: { name: ['Too short.'] },
      });
      expect(assign).not.toHaveBeenCalled();
    } finally {
      cleanup();
    }
  });
});
