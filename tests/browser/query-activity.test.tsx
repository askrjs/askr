import { afterEach, expect, test, vi } from 'vite-plus/test';
import { cleanupApp, createIsland } from '@askrjs/askr/boot';
import { state } from '@askrjs/askr';
import type { JSXElement } from '@askrjs/askr/jsx-runtime';
import {
  createDataRuntime,
  createQuery,
  createQueryCollection,
  defineQuery,
  refreshOnActivity,
  type QueryCollection,
  type RefreshOnActivityOptions,
} from '@askrjs/askr/data';
import { flushScheduler } from '../../test-utils/render/test-renderer';

const roots: HTMLElement[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    cleanupApp(root);
    root.remove();
  }
  vi.restoreAllMocks();
});

function mount(component: () => JSXElement, runtime = createDataRuntime()) {
  const root = document.createElement('div');
  roots.push(root);
  document.body.append(root);
  createIsland({ root, component, dataRuntime: runtime });
  flushScheduler();
  return { root, runtime };
}

async function settle() {
  flushScheduler();
  await Promise.resolve();
  await Promise.resolve();
  flushScheduler();
}

function fire(event: 'focus' | 'online' | 'visibilitychange') {
  (event === 'visibilitychange' ? document : window).dispatchEvent(
    new Event(event)
  );
}

test('should gate focus and visibility using freshness age and fetch completion', async () => {
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const fetch = vi.fn(async () => ({ value: 'updated' }));
  const { root } = mount(() => {
    const query = createQuery({
      key: 'activity:1',
      fetch,
      initialData: { value: 'seed' },
    });
    refreshOnActivity('activity:', { staleTimeMs: 100 });
    return <span>{query.data?.value}</span>;
  });
  fire('focus');
  await settle();
  expect(fetch).not.toHaveBeenCalled();
  clock.mockReturnValue(1100);
  fire('focus');
  fire('visibilitychange');
  await settle();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(root.textContent).toBe('updated');
  fire('online');
  await settle();
  expect(fetch).toHaveBeenCalledTimes(1);
  clock.mockReturnValue(1200);
  fire('visibilitychange');
  await settle();
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('should join existing work across readers and reconnect without aborting it', async () => {
  let resolve!: (data: { value: string }) => void;
  let signal!: AbortSignal;
  const fetch = vi.fn((context: { signal: AbortSignal }) => {
    signal = context.signal;
    return new Promise<{ value: string }>((done) => {
      resolve = done;
    });
  });
  const initialData = { value: 'seed' };
  function Reader() {
    const query = createQuery({ key: 'activity:shared', fetch, initialData });
    refreshOnActivity('activity:', { staleTimeMs: 'always' });
    return <span>{query.data?.value}</span>;
  }
  const { root } = mount(() => (
    <main>
      <Reader />
      <Reader />
    </main>
  ));
  fire('focus');
  await settle();
  fire('online');
  fire('visibilitychange');
  await settle();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(signal.aborted).toBe(false);
  resolve({ value: 'joined' });
  await settle();
  expect(root.textContent).toBe('joinedjoined');
});

test('should leave hidden, disabled and skipped queries inactive', async () => {
  const visible = vi
    .spyOn(document, 'visibilityState', 'get')
    .mockReturnValue('hidden');
  const fetch = vi.fn(async () => ({ value: 'updated' }));
  mount(() => {
    createQuery({ key: 'disabled:1', fetch, initialData: { value: 'seed' } });
    createQuery({ key: 'skipped:1', fetch, skipInitialFetch: true });
    refreshOnActivity('disabled:', { staleTimeMs: 'always', enabled: false });
    refreshOnActivity('skipped:', { staleTimeMs: 'always' });
    refreshOnActivity('disabled:', { staleTimeMs: 'always', online: false });
    return <span>ready</span>;
  });
  fire('visibilitychange');
  fire('focus');
  fire('online');
  await settle();
  expect(fetch).not.toHaveBeenCalled();
  visible.mockReturnValue('visible');
  fire('visibilitychange');
  await settle();
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('should respect prefix boundaries and independent runtime scope', async () => {
  const first = createDataRuntime();
  const second = createDataRuntime();
  const fetchA = vi.fn(async () => ({ value: 'A' }));
  const fetchB = vi.fn(async () => ({ value: 'B' }));
  const fetchOther = vi.fn(async () => ({ value: 'other' }));
  mount(() => {
    createQuery({
      key: 'user:1',
      fetch: fetchA,
      initialData: { value: 'seed' },
    });
    createQuery({
      key: 'user:10',
      fetch: fetchOther,
      initialData: { value: 'seed' },
    });
    refreshOnActivity('user:1', { staleTimeMs: 'always' });
    return <span>A</span>;
  }, first);
  const b = mount(() => {
    createQuery({
      key: 'user:1',
      fetch: fetchB,
      initialData: { value: 'seed' },
    });
    return <span>B</span>;
  }, second);
  fire('online');
  await settle();
  expect(fetchA).toHaveBeenCalledTimes(1);
  expect(fetchB).not.toHaveBeenCalled();
  expect(fetchOther).not.toHaveBeenCalled();
  cleanupApp(b.root);
  mount(() => {
    createQuery({
      key: 'user:1',
      fetch: fetchB,
      initialData: { value: 'seed' },
    });
    refreshOnActivity('user:1', {
      staleTimeMs: 'always',
      runtime: second,
      focus: false,
    });
    return <span>B</span>;
  }, second);
  fire('online');
  await settle();
  expect(fetchA).toHaveBeenCalledTimes(2);
  expect(fetchB).toHaveBeenCalledTimes(1);
});

test('should remove listeners and abort work on disposal and reject late results after replacement', async () => {
  const add = vi.spyOn(window, 'addEventListener');
  const remove = vi.spyOn(window, 'removeEventListener');
  const addDocument = vi.spyOn(document, 'addEventListener');
  const removeDocument = vi.spyOn(document, 'removeEventListener');
  let resolve!: (data: { value: string }) => void;
  let signal!: AbortSignal;
  const runtime = createDataRuntime();
  const fetch = vi.fn((context: { signal: AbortSignal }) => {
    signal = context.signal;
    return new Promise<{ value: string }>((done) => {
      resolve = done;
    });
  });
  const { root } = mount(() => {
    const query = createQuery({
      key: 'activity:late',
      fetch,
      initialData: { value: 'seed' },
    });
    refreshOnActivity('activity:', { staleTimeMs: 'always' });
    return <span>{query.data?.value}</span>;
  }, runtime);
  const registered = add.mock.calls.filter(
    ([event]) => event === 'focus' || event === 'online'
  );
  expect(registered).toHaveLength(2);
  const visibilityListener = addDocument.mock.calls.find(
    ([event]) => event === 'visibilitychange'
  )?.[1];
  expect(visibilityListener).toBeDefined();
  fire('online');
  await settle();
  cleanupApp(root);
  expect(signal.aborted).toBe(true);
  expect(removeDocument).toHaveBeenCalledWith(
    'visibilitychange',
    visibilityListener,
    undefined
  );
  for (const [event, listener] of registered) {
    expect(remove).toHaveBeenCalledWith(event, listener, undefined);
  }
  const next = mount(() => {
    const query = createQuery({
      key: 'activity:late',
      fetch: async () => ({ value: 'new' }),
      initialData: { value: 'new' },
    });
    return <span>{query.data?.value}</span>;
  }, runtime);
  resolve({ value: 'late' });
  fire('online');
  await settle();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(next.root.textContent).toBe('new');
});

test('should share the initial generation on reconnect during initial loading', async () => {
  let resolve!: (data: { value: string }) => void;
  const fetch = vi.fn(
    () =>
      new Promise<{ value: string }>((done) => {
        resolve = done;
      })
  );
  const { root } = mount(() => {
    const query = createQuery({ key: 'initial:1', fetch });
    refreshOnActivity('initial:', { staleTimeMs: 'always' });
    return <span>{query.data?.value}</span>;
  });
  fire('online');
  await settle();
  expect(fetch).toHaveBeenCalledTimes(1);
  resolve({ value: 'loaded' });
  await settle();
  expect(root.textContent).toBe('loaded');
});

test('should refresh failed queries within a long freshness age', async () => {
  const fetch = vi
    .fn<() => Promise<{ value: string }>>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ value: 'recovered' });
  const { root } = mount(() => {
    const query = createQuery({ key: 'failure:1', fetch });
    refreshOnActivity('failure:', { staleTimeMs: 60_000 });
    return <span>{query.data?.value}</span>;
  });
  await settle();
  fire('online');
  await settle();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(root.textContent).toBe('recovered');
});

test('should preserve collection concurrency and queued work across activity', async () => {
  let collection!: QueryCollection<number, { id: number }, number>;
  const releases: Array<() => void> = [];
  const fetch = vi.fn(
    (id: number) =>
      new Promise<{ id: number }>((resolve) => {
        releases.push(() => resolve({ id }));
      })
  );
  const query = defineQuery({ key: (id: number) => `collection:${id}`, fetch });
  mount(() => {
    collection = createQueryCollection({
      query,
      inputs: () => [1, 2],
      key: (id) => id,
      concurrency: 1,
    });
    refreshOnActivity('collection:', { staleTimeMs: 'always' });
    return <span>collection</span>;
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  releases.shift()!();
  await expect
    .poll(() => {
      flushScheduler();
      return fetch.mock.calls.length;
    })
    .toBe(2);
  expect(fetch).toHaveBeenCalledTimes(2);
  releases.shift()!();
  await expect
    .poll(() => {
      flushScheduler();
      return collection.settled;
    })
    .toBe(true);
  fire('online');
  fire('focus');
  await settle();
  expect(fetch).toHaveBeenCalledTimes(3);
  fire('online');
  await settle();
  expect(fetch).toHaveBeenCalledTimes(3);
  releases.shift()!();
  await expect
    .poll(() => {
      flushScheduler();
      return fetch.mock.calls.length;
    })
    .toBe(4);
  expect(fetch).toHaveBeenCalledTimes(4);
  releases.shift()!();
  await settle();
});

test('should replace listener policy on rerender without accumulating registrations', async () => {
  const fetch = vi.fn(async () => ({ value: 'updated' }));
  let enable!: () => void;
  mount(() => {
    const enabled = state(false);
    enable = () => enabled.set(true);
    const query = createQuery({
      key: 'activity:toggle',
      fetch,
      initialData: { value: 'seed' },
    });
    refreshOnActivity('activity:', {
      staleTimeMs: 'always',
      enabled: enabled(),
    });
    return <span>{query.data?.value}</span>;
  });
  fire('online');
  await settle();
  expect(fetch).not.toHaveBeenCalled();
  enable();
  await settle();
  fire('online');
  await settle();
  expect(fetch).toHaveBeenCalledTimes(1);
});

test.each([-1, Infinity, NaN])(
  'should reject an invalid freshness age %s',
  (staleTimeMs) => {
    expect(() => refreshOnActivity('activity:', { staleTimeMs })).toThrow(
      /staleTimeMs/
    );
  }
);

test('should require an explicit freshness policy', () => {
  expect(() =>
    refreshOnActivity(
      'activity:',
      undefined as unknown as RefreshOnActivityOptions
    )
  ).toThrow(/staleTimeMs/);
});
