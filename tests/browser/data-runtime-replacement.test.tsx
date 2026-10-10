import { expect, test } from 'vite-plus/test';
import { cleanupApp, createSPA, replaceDataRuntime } from '@askrjs/askr/boot';
import { createDataRuntime, disposeDataRuntime } from '@askrjs/askr/data';
import { createRouteRegistry, navigate, route } from '@askrjs/askr/router';
import { flush } from '@askrjs/askr/testing';

test('should return an obsolete pending back traversal to the still-rendered entry after identity replacement', async () => {
  const previousUrl = location.href;
  const root = document.body.appendChild(document.createElement('main'));
  const old = createDataRuntime();
  const next = createDataRuntime();
  let pending = false;
  let started = false;
  let release!: (value: string) => void;
  const ignoredAbort = new Promise<string>((resolve) => {
    release = resolve;
  });
  const registry = createRouteRegistry(() => {
    route('/replacement-home', () => <p>home identity</p>);
    route('/replacement-back', () => <p>back identity</p>, {
      loader: () => {
        if (!pending) return 'ready';
        started = true;
        return ignoredAbort;
      },
    });
  });
  try {
    history.pushState({ askrIndex: 0 }, '', '/replacement-home');
    await createSPA({ root, registry, dataRuntime: old });
    navigate('/replacement-back');
    await expect.poll(() => root.textContent).toBe('back identity');
    navigate('/replacement-home');
    await expect.poll(() => root.textContent).toBe('home identity');
    const home = root.querySelector('p');
    const length = history.length;
    pending = true;
    history.back();
    await expect.poll(() => started).toBe(true);
    expect(location.pathname).toBe('/replacement-back');
    replaceDataRuntime(root, next);
    disposeDataRuntime(old);
    release('obsolete back result');
    await expect.poll(() => location.pathname).toBe('/replacement-home');
    flush();
    expect(root.querySelector('p')).toBe(home);
    expect(root.textContent).toBe('home identity');
    expect(history.length).toBe(length);
    // The old history entry remains usable with the current app owner.
    pending = false;
    history.back();
    await expect.poll(() => root.textContent).toBe('back identity');
    expect(location.pathname).toBe('/replacement-back');
    expect(history.length).toBe(length);
  } finally {
    cleanupApp(root);
    root.remove();
    disposeDataRuntime(old);
    disposeDataRuntime(next);
    history.replaceState({}, '', previousUrl);
  }
});
