import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { schema } from '@askrjs/schema';
import { state } from '../../../src';
import { action, ActionForm, defineAction } from '../../../src/actions';
import {
  cleanupApp,
  createIsland,
  hydrateSPA,
  replaceDataRuntime,
} from '../../../src/boot';
import { createDataRuntime, disposeDataRuntime } from '../../../src/data';
import { createRouteRegistry, route } from '../../../src/router';
import { resetRouterState } from '../../../src/router/reset';
import { renderToStringSync } from '../../../src/ssr';
import { createPageRenderEnvelope } from '../../../src/common/page-render-envelope';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

const save = defineAction({
  id: 'resolved-csrf-save',
  input: schema.object({ name: schema.string() }),
  invalidates: ['items:'],
});
type Command = ReturnType<typeof action<{ name: string }, { saved: string }>>;
type Resolver = (signal: AbortSignal) => Promise<string | undefined>;
const views: ReturnType<typeof createTestContainer>[] = [];
const runtimes: ReturnType<typeof createDataRuntime>[] = [];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function mount(resolve: Resolver) {
  const view = createTestContainer();
  const runtime = createDataRuntime();
  views.push(view);
  runtimes.push(runtime);
  let command!: Command;
  createIsland({
    root: view.container,
    dataRuntime: runtime,
    component: () => {
      command = action<{ name: string }, { saved: string }>(save, {
        csrfToken: resolve,
      });
      return <p>{command.state().pending ? 'pending' : 'ready'}</p>;
    },
  });
  return {
    ...view,
    runtime,
    get command() {
      return command;
    },
  };
}
function post() {
  const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
    Response.json({ result: { saved: JSON.parse(String(init?.body)).name } })
  );
  vi.stubGlobal('fetch', request);
  return request;
}
beforeEach(() => {
  Reflect.deleteProperty(globalThis, Symbol.for('__ASKR_EXECUTION_MODEL__'));
  resetRouterState();
  window.history.replaceState({}, '', '/');
});
afterEach(() => {
  for (const view of views.splice(0)) {
    cleanupApp(view.container);
    view.cleanup();
  }
  for (const runtime of runtimes.splice(0)) disposeDataRuntime(runtime);
  vi.unstubAllGlobals();
  resetRouterState();
  Reflect.deleteProperty(globalThis, Symbol.for('__ASKR_EXECUTION_MODEL__'));
});

it('should resolve a fresh token for each submission and forward the owned signal', async () => {
  const request = post();
  const resolver = vi
    .fn<Resolver>()
    .mockResolvedValueOnce('first-token')
    .mockResolvedValueOnce('second-token');
  const view = mount(resolver);
  await view.command.submit({ name: 'first' });
  await view.command.submit({ name: 'second' });
  expect(resolver).toHaveBeenCalledTimes(2);
  for (const [index, token] of ['first-token', 'second-token'].entries()) {
    const init = request.mock.calls[index]![1]!;
    expect(new Headers(init.headers).get('x-askr-csrf-token')).toBe(token);
    expect(init.signal).toBe(resolver.mock.calls[index]![0]);
    expect(init.signal?.aborted).toBe(false);
  }
});

it('should keep token selection and successful invalidation isolated between roots', async () => {
  const request = post();
  const first = mount(async () => 'first-root');
  const second = mount(async () => 'second-root');
  first.runtime.queryData.set('items:one', 'a');
  second.runtime.queryData.set('items:one', 'b');
  await first.command.submit({ name: 'a' });
  expect(first.runtime.queryData.has('items:one')).toBe(false);
  expect(second.runtime.queryData.get('items:one')).toBe('b');
  await second.command.submit({ name: 'b' });
  expect(
    request.mock.calls.map((call) =>
      new Headers(call[1]?.headers).get('x-askr-csrf-token')
    )
  ).toEqual(['first-root', 'second-root']);
});

it('should not invoke the resolver during SSR or fall back when it returns undefined', async () => {
  const request = post();
  const resolver = vi.fn<Resolver>().mockResolvedValue(undefined);
  const view = createTestContainer();
  views.push(view);
  let command!: Command;
  const Page = () => {
    command = action<{ name: string }, { saved: string }>(save, {
      csrfToken: resolver,
    });
    return (
      <ActionForm action={save}>
        <button disabled={command.state().pending}>save</button>
      </ActionForm>
    );
  };
  view.container.innerHTML = renderToStringSync(
    Page,
    {},
    {
      envelope: createPageRenderEnvelope({
        framework: { csrf: 'old-ssr-token' },
      }),
    }
  );
  expect(
    view.container.querySelector('input[name="_csrf"]')?.getAttribute('value')
  ).toBe('old-ssr-token');
  expect(resolver).not.toHaveBeenCalled();
  const registry = createRouteRegistry(() => {
    route('/', Page);
  });
  await hydrateSPA({ root: view.container, registry });
  await command.submit({ name: 'anonymous' });
  expect(
    new Headers(request.mock.calls[0]![1]?.headers).has('x-askr-csrf-token')
  ).toBe(false);
});

it('should reject a resolver failure without sending a mutation or retrying', async () => {
  const request = post();
  const failure = new Error('bootstrap failed');
  const resolver = vi.fn<Resolver>().mockRejectedValue(failure);
  const view = mount(resolver);
  await expect(view.command.submit({ name: 'a' })).rejects.toBe(failure);
  expect(view.command.state().error).toBe(failure);
  expect(request).not.toHaveBeenCalled();
  expect(resolver).toHaveBeenCalledOnce();
});

it.each([null, 42, {}, '', 'with space', 'line\r\nbreak'])(
  'should reject invalid resolved token %j before POST',
  async (token) => {
    const request = post();
    const view = mount(async () => token as unknown as string | undefined);
    await expect(view.command.submit({ name: 'a' })).rejects.toThrow(
      'csrfToken'
    );
    expect(request).not.toHaveBeenCalled();
  }
);

it.each(['unmount', 'retire'] as const)(
  'should fence an abort-ignoring resolver after %s',
  async (kind) => {
    const request = post();
    const pending = deferred<string>();
    let signal!: AbortSignal;
    const view = mount((value) => {
      signal = value;
      return pending.promise;
    });
    const originalCommand = view.command;
    const originalState = originalCommand.state;
    const submission = view.command.submit({ name: 'private' });
    const outcome = submission.catch((error: unknown) => error);
    if (kind === 'unmount') cleanupApp(view.container);
    else disposeDataRuntime(view.runtime);
    expect(() => flushScheduler()).not.toThrow();
    expect(view.command.state).toBe(originalState);
    expect(signal.aborted).toBe(true);
    if (kind === 'retire') {
      expect(view.command).not.toBe(originalCommand);
      await expect(
        view.command.submit({ name: 'new handle' })
      ).rejects.toMatchObject({
        name: 'AbortError',
      });
      await expect(
        originalCommand.submit({ name: 'retained handle' })
      ).rejects.toMatchObject({
        name: 'AbortError',
      });
    }
    expect(await outcome).toMatchObject({ name: 'AbortError' });
    pending.resolve('late-private-token');
    await Promise.resolve();
    flushScheduler();
    expect(request).not.toHaveBeenCalled();
  }
);

it('should settle on retirement while an old POST ignores abort and prevent its late response', async () => {
  const pending = deferred<Response>();
  const request = vi.fn(
    (_input: RequestInfo | URL, _init?: RequestInit) => pending.promise
  );
  vi.stubGlobal('fetch', request);
  const view = mount(async () => 'current-token');
  const command = view.command;
  const outcome = command
    .submit({ name: 'private' })
    .catch((error: unknown) => error);
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  disposeDataRuntime(view.runtime);
  expect(await outcome).toMatchObject({ name: 'AbortError' });
  expect(request.mock.calls[0]![1]?.signal?.aborted).toBe(true);
  pending.resolve(Response.json({ result: { saved: 'late-private-result' } }));
  await Promise.resolve();
  flushScheduler();
  expect(command.state().result).toBeUndefined();
});

it('should preserve last-started-wins status while both requested mutations settle', async () => {
  const request = post();
  const first = deferred<string>();
  const second = deferred<string>();
  const resolver = vi
    .fn<Resolver>()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const view = mount(resolver);
  const command = view.command;
  const older = command.submit({ name: 'older' });
  const newer = command.submit({ name: 'newer' });
  second.resolve('newer-token');
  await expect(newer).resolves.toEqual({ saved: 'newer' });
  first.resolve('older-token');
  await expect(older).resolves.toEqual({ saved: 'older' });
  expect(command.state().result).toEqual({ saved: 'newer' });
  expect(request).toHaveBeenCalledTimes(2);
  expect(resolver.mock.calls.every(([signal]) => !signal.aborted)).toBe(true);
});

it('should preserve a decoded interaction problem as the action error cause', async () => {
  const problem = {
    code: 'interaction-required',
    reason: 'consent',
    provider: 'company',
    resource: 'calendar',
    scopes: ['read'],
  };
  const request = vi.fn(async () => Response.json(problem, { status: 401 }));
  vi.stubGlobal('fetch', request);
  const view = mount(async () => 'current-token');
  const error = await view.command
    .submit({ name: 'a' })
    .catch((cause: unknown) => cause);
  expect(error).toMatchObject({ cause: problem });
  expect(request).toHaveBeenCalledOnce();
});

it.each([
  null,
  [],
  { csrfToken: 'static' },
  { csrfToken: async () => 'token', fetch },
])(
  'should reject malformed resolver options %j before creating a hook',
  (options) => {
    const view = createTestContainer();
    views.push(view);
    expect(() =>
      createIsland({
        root: view.container,
        component: () => {
          Reflect.apply(action, undefined, [save, options]);
          return <p>unreachable</p>;
        },
      })
    ).toThrow('csrfToken');
  }
);

it('should reject a new component action on an already retired data owner', () => {
  const request = post();
  const resolver = vi.fn<Resolver>().mockResolvedValue('unreachable');
  const view = createTestContainer();
  const runtime = createDataRuntime();
  views.push(view);
  runtimes.push(runtime);
  disposeDataRuntime(runtime);
  expect(() =>
    createIsland({
      root: view.container,
      dataRuntime: runtime,
      component: () => {
        const command = action(save, { csrfToken: resolver });
        return <p>{command.state().pending ? 'pending' : 'ready'}</p>;
      },
    })
  ).toThrow('data runtime was disposed');
  expect(resolver).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});

it('should reject a new action in an existing state slot after retirement', () => {
  const request = post();
  const resolver = vi.fn<Resolver>().mockResolvedValue('unreachable');
  const view = createTestContainer();
  const runtime = createDataRuntime();
  views.push(view);
  runtimes.push(runtime);
  let useAction = false;
  const Page = () => {
    const status = useAction
      ? action(save, { csrfToken: resolver }).state
      : state({ pending: false });
    return <p>{status().pending ? 'pending' : 'ready'}</p>;
  };
  createIsland({ root: view.container, dataRuntime: runtime, component: Page });
  disposeDataRuntime(runtime);
  useAction = true;
  expect(() =>
    createIsland({
      root: view.container,
      dataRuntime: runtime,
      component: Page,
    })
  ).toThrow('data runtime was disposed');
  expect(resolver).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});

it('should reject a changed action id on the same retired component owner', () => {
  const request = post();
  const resolver = vi.fn<Resolver>().mockResolvedValue('unreachable');
  const view = createTestContainer();
  const runtime = createDataRuntime();
  views.push(view);
  runtimes.push(runtime);
  let descriptor = save;
  const Page = () => {
    const command = action(descriptor, { csrfToken: resolver });
    return <p>{command.state().pending ? 'pending' : 'ready'}</p>;
  };
  createIsland({ root: view.container, dataRuntime: runtime, component: Page });
  disposeDataRuntime(runtime);
  descriptor = defineAction({
    id: 'different-retired-action',
    input: save.input,
  });
  expect(() =>
    createIsland({
      root: view.container,
      dataRuntime: runtime,
      component: Page,
    })
  ).toThrow('data runtime was disposed');
  expect(resolver).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});

it('should reject another retired runtime despite a retained action state and id', () => {
  const request = post();
  const resolver = vi.fn<Resolver>().mockResolvedValue('unreachable');
  const view = createTestContainer();
  const original = createDataRuntime();
  const next = createDataRuntime();
  views.push(view);
  runtimes.push(original, next);
  const Page = () => {
    const command = action(save, { csrfToken: resolver });
    return <p>{command.state().pending ? 'pending' : 'ready'}</p>;
  };
  createIsland({
    root: view.container,
    dataRuntime: original,
    component: Page,
  });
  disposeDataRuntime(next);
  expect(() =>
    createIsland({ root: view.container, dataRuntime: next, component: Page })
  ).toThrow('data runtime was disposed');
  expect(resolver).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});

it('should restore the retained action binding when an active runtime rebind is discarded', () => {
  const request = post();
  const resolver = vi.fn<Resolver>().mockResolvedValue('unreachable');
  const view = createTestContainer();
  const original = createDataRuntime();
  const next = createDataRuntime();
  views.push(view);
  runtimes.push(original, next);
  let fail = false;
  let command!: Command;
  const Page = () => {
    command = action<{ name: string }, { saved: string }>(save, {
      csrfToken: resolver,
    });
    const pending = command.state().pending;
    if (fail) throw new Error('discard action runtime rebind');
    return <p>{pending ? 'pending' : 'ready'}</p>;
  };
  createIsland({
    root: view.container,
    dataRuntime: original,
    component: Page,
  });
  const originalState = command.state;
  fail = true;
  expect(() => replaceDataRuntime(view.container, next)).toThrow(
    'discard action runtime rebind'
  );
  fail = false;
  disposeDataRuntime(original);
  expect(() =>
    createIsland({
      root: view.container,
      dataRuntime: original,
      component: Page,
    })
  ).not.toThrow();
  expect(command.state).toBe(originalState);
  expect(resolver).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
});
