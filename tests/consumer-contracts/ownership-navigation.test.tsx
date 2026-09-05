import { expect, test } from 'vitest';
import { getDefaultRuntime, type RuntimeRendererHost } from '@askrjs/askr';
import { cleanupApp, createSPA } from '@askrjs/askr/boot';
import { createRouteRegistry, navigate, route } from '@askrjs/askr/router';
type Owner = NonNullable<Parameters<RuntimeRendererHost['evaluate']>[3]>;

test('should clear a retained extension collection before retired route cleanup', async () => {
  const runtime = getDefaultRuntime();
  const original = runtime.renderer;
  const previousUrl = location.href;
  const root = document.createElement('main');
  document.body.append(root);
  history.replaceState({}, '', '/owned-before');
  let owner: Owner | undefined;
  runtime.configureRenderer({
    ...original,
    evaluate(...args) {
      owner ??= args[3];
      original.evaluate(...args);
    },
  });
  const registry = createRouteRegistry(() => {
    route('/owned-before', () => <p>before</p>);
    route('/owned-after', () => <p>after</p>);
  });
  const calls: string[] = [];
  let sizeDuringCleanup: number | undefined;
  try {
    await createSPA({ root, registry, scrollRestoration: false });
    const late = { key: 'late', dispose: () => calls.push('late') };
    const scopes = new Set([
      {
        key: 'retired',
        dispose() {
          calls.push('child');
          scopes.add(late);
        },
      },
    ]);
    owner!._ownedChildScopes = scopes;
    (owner!.cleanupFns ??= []).push(() => {
      calls.push('cleanup');
      sizeDuringCleanup = scopes.size;
    });
    await navigate('/owned-after');
    expect(root.textContent).toBe('after');
    expect(calls).toEqual(['child', 'late', 'cleanup']);
    expect(sizeDuringCleanup).toBe(0);
    expect(scopes.size).toBe(0);
  } finally {
    cleanupApp(root);
    root.remove();
    history.replaceState({}, '', previousUrl);
    runtime.configureRenderer(original);
  }
});
