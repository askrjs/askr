import { describe, expect, it } from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import { Show } from '../../../src/control';
import { state } from '../../../src';
import { renderToStringSync } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { routeRegistryFromTable } from '../../router-test-utils';

describe('empty Show hydration cursor', () => {
  it('should adopt a component sibling after one empty Show boundary', async () => {
    function Tail() {
      return <nav data-tail={'true'}>tail</nav>;
    }

    function App() {
      return (
        <main>
          <Show when={false}>
            <section>first</section>
          </Show>
          <Tail />
        </main>
      );
    }

    const { container, cleanup } = createTestContainer();
    try {
      container.innerHTML = renderToStringSync(App);
      const serverTail = container.querySelector('[data-tail]');

      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable([{ path: '/', handler: App }]),
      });

      expect(container.querySelectorAll('[data-tail]')).toHaveLength(1);
      expect(container.querySelector('[data-tail]')).toBe(serverTail);
    } finally {
      cleanup();
    }
  });

  it('should adopt a component sibling after consecutive empty Show boundaries', async () => {
    let setFirst!: (value: boolean) => void;
    let setSecond!: (value: boolean) => void;

    function Tail() {
      return <nav data-tail={'true'}>tail</nav>;
    }

    function App() {
      const first = state(false);
      const second = state(false);
      setFirst = first.set;
      setSecond = second.set;
      return (
        <main>
          <Show when={first()}>
            <section data-first={'true'}>first</section>
          </Show>
          <Show when={second()}>
            <section data-second={'true'}>second</section>
          </Show>
          <Tail />
        </main>
      );
    }

    const { container, cleanup } = createTestContainer();
    try {
      container.innerHTML = renderToStringSync(App);
      const serverTail = container.querySelector('[data-tail]');

      expect(serverTail).not.toBeNull();
      expect(container.querySelectorAll('[data-tail]')).toHaveLength(1);

      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable([{ path: '/', handler: App }]),
      });

      expect(container.querySelectorAll('[data-tail]')).toHaveLength(1);
      expect(container.querySelector('[data-tail]')).toBe(serverTail);

      setFirst(true);
      flushScheduler();

      expect(container.querySelector('[data-first]')).not.toBeNull();
      expect(container.querySelector('[data-second]')).toBeNull();
      expect(container.querySelectorAll('[data-tail]')).toHaveLength(1);
      expect(container.querySelector('[data-tail]')).toBe(serverTail);

      setSecond(true);
      flushScheduler();

      expect(container.querySelector('[data-first]')).not.toBeNull();
      expect(container.querySelector('[data-second]')).not.toBeNull();
      expect(container.querySelectorAll('[data-tail]')).toHaveLength(1);
      expect(container.querySelector('[data-tail]')).toBe(serverTail);

      setFirst(false);
      setSecond(false);
      flushScheduler();

      expect(container.querySelector('[data-first]')).toBeNull();
      expect(container.querySelector('[data-second]')).toBeNull();
      expect(container.querySelectorAll('[data-tail]')).toHaveLength(1);
      expect(container.querySelector('[data-tail]')).toBe(serverTail);

      setFirst(true);
      setSecond(true);
      flushScheduler();

      expect(container.querySelector('[data-first]')).not.toBeNull();
      expect(container.querySelector('[data-second]')).not.toBeNull();
      expect(container.querySelectorAll('[data-tail]')).toHaveLength(1);
      expect(container.querySelector('[data-tail]')).toBe(serverTail);
    } finally {
      cleanup();
    }
  });
});
