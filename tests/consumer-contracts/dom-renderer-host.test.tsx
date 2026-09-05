import { expect, test } from 'vitest';
import {
  createDOMRendererHost,
  createRuntime,
  type DOMRendererHost,
} from '@askrjs/askr';
import { debounce, throttle, raf } from '@askrjs/askr/fx';

test('should expose a working opaque adapter from the installed root', () => {
  let roles!: DOMRendererHost;
  const host = createDOMRendererHost((native) => (roles = { ...native }));
  const runtime = createRuntime({ renderer: host });
  expect(runtime.renderer).toBe(host);
  const target = document.createElement('main');
  runtime.renderer.evaluate(<span>packed</span>, target);
  expect(target.textContent).toBe('packed');
  const receivers: unknown[] = [];
  roles.cleanup = {
    ...roles.cleanup,
    cleanupInstancesUnder() {
      receivers.push(this);
    },
  };
  host.cleanupInstancesUnder(target);
  expect(receivers).toEqual([roles.cleanup]);
  runtime.configureRenderer({ ...host });
  runtime.renderer.evaluate(<span>legacy</span>, target);
  expect(target.textContent).toBe('legacy');
});

test('should type installed timing calls as void', () => {
  const delayed = debounce(() => 42, 1);
  const limited = throttle(() => 42, 1);
  const result: void = delayed();
  const leading: void = limited();
  expect(result).toBeUndefined();
  expect(leading).toBeUndefined();
  delayed.cancel();
  limited.cancel();
  const frame: (value: number) => void = raf((value: number) => value);
  expect(typeof frame).toBe('function');
});
