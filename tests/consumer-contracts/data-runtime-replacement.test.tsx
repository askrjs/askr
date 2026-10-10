import { expect, test } from 'vitest';
import { state } from '@askrjs/askr';
import { cleanupApp, createSPA, replaceDataRuntime } from '@askrjs/askr/boot';
import {
  createDataRuntime,
  createQuery,
  defineQuery,
  disposeDataRuntime,
  prefetchQuery,
  type Query,
} from '@askrjs/askr/data';
import { createRouteRegistry, navigate, route } from '@askrjs/askr/router';
import { flush } from '@askrjs/askr/testing';

async function settle(): Promise<void> {
  for (let index = 0; index < 16; index++) {
    await Promise.resolve();
    flush();
  }
}

test('should switch an installed routed app identity without remounting or publishing late old work', async () => {
  const root = document.createElement('main');
  document.body.append(root);
  const previousUrl = location.href;
  history.replaceState({}, '', '/identity');
  const old = createDataRuntime();
  const next = createDataRuntime();
  old.queryData.set('installed:identity', 'Alice');
  next.queryData.set('installed:identity', 'Bob');
  let release!: (value: string) => void;
  const ignoredAbort = new Promise<string>((resolve) => {
    release = resolve;
  });
  const user = defineQuery({
    key: () => 'installed:identity',
    fetch: () => ignoredAbort,
  });
  const detail = defineQuery({
    key: () => 'installed:detail',
    fetch: async () => 'Bob detail',
  });
  let handle!: Query<string>;
  const registry = createRouteRegistry(() => {
    route('/identity', () => {
      const count = state(0);
      handle = createQuery(user, {});
      return (
        <button onClick={() => count.set(count() + 1)}>
          {count()}:{handle.data}
        </button>
      );
    });
    route(
      '/detail',
      () => {
        const result = createQuery(detail, {});
        return <output>{result.data}</output>;
      },
      { preload: ({ data }) => prefetchQuery(data, detail, {}) }
    );
  });
  try {
    await createSPA({ root, registry, dataRuntime: old });
    const button = root.querySelector('button')!;
    button.click();
    flush();
    const oldHandle = handle;
    const refresh = oldHandle.refresh();
    replaceDataRuntime(root, next);
    disposeDataRuntime(old);
    await settle();
    expect(root.querySelector('button')).toBe(button);
    expect(button.textContent).toBe('1:Bob');
    expect(oldHandle.data).toBeNull();
    release('late Alice');
    await refresh;
    await settle();
    expect(button.textContent).toBe('1:Bob');
    navigate('/detail');
    await settle();
    expect(root.textContent).toBe('Bob detail');
    expect(next.queryCache.has('installed:detail')).toBe(true);
    expect(old.queryCache.size).toBe(0);
  } finally {
    cleanupApp(root);
    root.remove();
    disposeDataRuntime(old);
    disposeDataRuntime(next);
    history.replaceState({}, '', previousUrl);
  }
});
