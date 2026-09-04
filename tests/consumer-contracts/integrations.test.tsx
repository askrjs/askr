import { expect, test } from 'vitest';
import { createRef, getDefaultRuntime, state } from '@askrjs/askr';
import { cleanupApp, createSPA, hydrateSPA } from '@askrjs/askr/boot';
import { resource } from '@askrjs/askr/resources';
import {
  createRouteRegistry,
  currentRoute,
  navigate,
  route,
} from '@askrjs/askr/router';
import { renderToString } from '@askrjs/askr/ssr';

test('should adopt hydrated inputs and refs before handling interactions', async () => {
  const root = document.createElement('main');
  document.body.append(root);
  const previousUrl = location.href;
  history.replaceState({}, '', '/hydrated');
  const ref = createRef<HTMLInputElement>();
  let calls = 0;
  const registry = createRouteRegistry(() => {
    route('/hydrated', () => {
      const value = state('server');
      return (
        <input
          ref={ref}
          value={value()}
          onInput={(event) => {
            calls++;
            if (event.currentTarget instanceof HTMLInputElement) {
              value.set(event.currentTarget.value);
            }
          }}
        />
      );
    });
  });
  try {
    root.innerHTML = renderToString({ url: '/hydrated', registry });
    const input = root.querySelector('input')!;
    await hydrateSPA({ root, registry });
    expect(root.querySelector('input')).toBe(input);
    expect(ref.current).toBe(input);
    expect(calls).toBe(0);
    input.value = 'client';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    getDefaultRuntime().scheduler.flushIfQueued();
    expect(calls).toBe(1);
    expect(input.value).toBe('client');
    expect(ref.current).toBe(input);
  } finally {
    cleanupApp(root);
    root.remove();
    history.replaceState({}, '', previousUrl);
  }
});

test('should publish navigation and retire pending work from the previous route', async () => {
  const root = document.createElement('main');
  document.body.append(root);
  const previousUrl = location.href;
  history.replaceState({}, '', '/pending');
  let signal!: AbortSignal;
  let resolve!: (value: string) => void;
  let committedRoutePath: string | undefined;
  const registry = createRouteRegistry(() => {
    route('/pending', () => {
      const result = resource((context): Promise<string> => {
        signal = context.signal;
        return new Promise((done) => {
          resolve = done;
        });
      }, []);
      return <output>{result.value ?? 'pending'}</output>;
    });
    route('/complete', () => {
      committedRoutePath = currentRoute()?.path;
      return <output>complete</output>;
    });
  });
  try {
    await createSPA({ root, registry, scrollRestoration: false });
    expect(signal.aborted).toBe(false);
    await navigate('/complete');
    getDefaultRuntime().scheduler.flushIfQueued();
    expect(signal.aborted).toBe(true);
    expect(root.textContent).toBe('complete');
    expect(committedRoutePath).toBe('/complete');
    expect(location.pathname).toBe('/complete');
    resolve('departed');
    await Promise.resolve();
    await Promise.resolve();
    getDefaultRuntime().scheduler.flushIfQueued();
    expect(root.textContent).toBe('complete');
  } finally {
    cleanupApp(root);
    root.remove();
    history.replaceState({}, '', previousUrl);
  }
});
