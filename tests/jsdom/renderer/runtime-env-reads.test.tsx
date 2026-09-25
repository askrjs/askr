import { afterEach, describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src/index';
import { For, Show } from '@askrjs/askr/control';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';
import { allowFrameworkWarnings } from '../../setup-env';

// Environment checks run on render and reconcile hot paths. Each one must
// read only the variable it needs: copying process.env per check made deep
// trees orders of magnitude slower on Windows (#526).
describe('runtime environment reads during rendering', () => {
  const originalEnv = process.env;
  let enumerations = 0;

  function countProcessEnvEnumerations(): void {
    enumerations = 0;
    process.env = new Proxy(
      { ...originalEnv },
      {
        ownKeys(target) {
          enumerations++;
          return Reflect.ownKeys(target);
        },
      }
    ) as NodeJS.ProcessEnv;
  }

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should mount and update components, lists and branches without enumerating process.env', () => {
    const { container, cleanup } = createTestContainer();
    let order!: ReturnType<typeof state<string[]>>;
    let visible!: ReturnType<typeof state<boolean>>;
    let rows!: ReturnType<typeof state<number>>;

    function Label({ text }: { text: string }) {
      return <span>{text}</span>;
    }

    function Nested({ depth }: { depth: number }) {
      return depth === 0 ? <Label text="leaf" /> : <Nested depth={depth - 1} />;
    }

    function App() {
      order = state(['a', 'b', 'c']);
      visible = state(true);
      rows = state(1_100);
      return (
        <main>
          <Nested depth={50} />
          <ul>
            {order().map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
          <For each={order} by={(id) => id}>
            {(id) => <Label text={id} />}
          </For>
          <Show when={visible} fallback={<p>hidden</p>}>
            <p>shown</p>
          </Show>
          <div>{() => `rows:${rows()}`}</div>
          <section>
            {Array.from({ length: rows() }, (_, index) => (
              <b>{`${index}`}</b>
            ))}
          </section>
        </main>
      );
    }

    // The unkeyed row list takes the bulk text path, and the dev warning
    // for it is itself a path that consults the environment.
    allowFrameworkWarnings(/Missing keys on dynamic lists/);
    countProcessEnvEnumerations();
    try {
      createIsland({ root: container, component: App });
      order.set(['c', 'a', 'b', 'd']);
      visible.set(false);
      rows.set(1_200);
      flushScheduler();

      expect(container.querySelector('ul')?.textContent).toBe('cabd');
      expect(container.textContent).toContain('hidden');
      expect(container.textContent).toContain('rows:1200');
      expect(container.querySelectorAll('section b')).toHaveLength(1_200);
      expect(enumerations).toBe(0);
    } finally {
      cleanup();
    }
  });
});
