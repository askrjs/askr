import { describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src';
import { createSPA, hydrateSPA } from '../../../src/boot';
import { defineSetupComponent } from '../../../src/runtime/component/setup-prototype';
import { renderToStringSync } from '../../../src/ssr';
import { resource, watch } from '../../../src/resources';
import { routeRegistryFromTable } from '../../router-test-utils';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../../test-utils/render/test-renderer';

describe('lifetime setup component prototype', () => {
  it('should reject positional hooks in the render callback', async () => {
    const Page = defineSetupComponent(() => () => {
      state(1);
      return <p>{'unreachable'}</p>;
    });
    const { container, cleanup } = createTestContainer();
    const registry = routeRegistryFromTable([{ path: '/', handler: Page }]);

    try {
      await expect(createSPA({ root: container, registry })).rejects.toThrow(
        /cannot run inside a setup component's render callback/
      );
    } finally {
      cleanup();
    }
  });

  it('should rerun ordinary conditional render code without recreating state', async () => {
    let setups = 0;
    let count: ReturnType<typeof state<number>>;
    let open: ReturnType<typeof state<boolean>>;
    const Page = defineSetupComponent(() => {
      setups++;
      count = state(0);
      open = state(false);
      return () => {
        if (!open())
          return (
            <main>
              <strong>{count()}</strong>
            </main>
          );
        return (
          <main>
            <strong>{count()}</strong>
            <span>{count()}</span>
          </main>
        );
      };
    });
    const { container, cleanup } = createTestContainer();
    const registry = routeRegistryFromTable([{ path: '/', handler: Page }]);

    try {
      await createSPA({ root: container, registry });
      flushScheduler();
      expect(container.querySelector('strong')?.textContent).toBe('0');
      count!.set(1);
      open!.set(true);
      flushScheduler();
      expect(container.querySelector('strong')?.textContent).toBe('1');
      expect(container.querySelector('span')?.textContent).toBe('1');
      expect(setups).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('should receive fresh props and reset setup state on a keyed remount', async () => {
    let setups = 0;
    let identity: ReturnType<typeof state<string>>;
    let label: ReturnType<typeof state<string>>;
    const Child = defineSetupComponent<{ label: string }>(() => {
      setups++;
      const count = state(0);
      return (props) => (
        <button onClick={() => count.set(count() + 1)}>
          {props.label}:{count()}
        </button>
      );
    });
    const Page = () => {
      identity = state('a');
      label = state('first');
      return <Child key={identity()} label={label()} />;
    };
    const { container, cleanup } = createTestContainer();
    const registry = routeRegistryFromTable([{ path: '/', handler: Page }]);

    try {
      await createSPA({ root: container, registry });
      flushScheduler();
      const first = container.querySelector('button');
      first?.click();
      flushScheduler();
      expect(first?.textContent).toBe('first:1');
      label!.set('second');
      flushScheduler();
      expect(container.querySelector('button')?.textContent).toBe('second:1');
      expect(setups).toBe(1);
      identity!.set('b');
      flushScheduler();
      expect(container.querySelector('button')?.textContent).toBe('second:0');
      expect(setups).toBe(2);
    } finally {
      cleanup();
    }
  });

  it('should render changing loop lengths and an early return', async () => {
    let items: ReturnType<typeof state<string[]>>;
    const Page = defineSetupComponent(() => {
      items = state(['a']);
      return () => {
        if (items().length === 0) return <p>{'empty'}</p>;
        return (
          <ul>
            {items().map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        );
      };
    });
    const { container, cleanup } = createTestContainer();
    const registry = routeRegistryFromTable([{ path: '/', handler: Page }]);

    try {
      await createSPA({ root: container, registry });
      flushScheduler();
      expect(container.querySelectorAll('li')).toHaveLength(1);
      items!.set(['a', 'b', 'c']);
      flushScheduler();
      expect(
        Array.from(container.querySelectorAll('li'), (li) => li.textContent)
      ).toEqual(['a', 'b', 'c']);
      items!.set([]);
      flushScheduler();
      expect(container.textContent).toBe('empty');
    } finally {
      cleanup();
    }
  });

  it('should retain setup state when a render update rolls back', async () => {
    let fail: ReturnType<typeof state<boolean>>;
    let count: ReturnType<typeof state<number>>;
    let setups = 0;
    const Page = defineSetupComponent(() => {
      setups++;
      fail = state(false);
      count = state(0);
      return () => {
        if (fail()) throw new Error('render failed');
        return <p>{count()}</p>;
      };
    });
    const { container, cleanup } = createTestContainer();
    const registry = routeRegistryFromTable([{ path: '/', handler: Page }]);

    try {
      await createSPA({ root: container, registry });
      flushScheduler();
      const paragraph = container.querySelector('p');
      expect(() => {
        fail!.set(true);
        flushScheduler();
      }).toThrow('render failed');
      expect(container.querySelector('p')).toBe(paragraph);
      fail!.set(false);
      count!.set(1);
      flushScheduler();
      expect(container.querySelector('p')?.textContent).toBe('1');
      expect(setups).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('should adopt server output and update after hydration', async () => {
    let count: ReturnType<typeof state<number>>;
    const Page = defineSetupComponent(() => {
      count = state(1);
      return () => <button>{count}</button>;
    });
    const { container, cleanup } = createTestContainer();
    const registry = routeRegistryFromTable([{ path: '/', handler: Page }]);

    try {
      container.innerHTML = renderToStringSync(Page);
      const serverButton = container.querySelector('button');
      await hydrateSPA({
        root: container,
        registry,
        hydrate: { verifyMarkup: true },
      });
      flushScheduler();
      expect(container.querySelector('button')).toBe(serverButton);
      count!.set(2);
      flushScheduler();
      expect(container.querySelector('button')?.textContent).toBe('2');
    } finally {
      cleanup();
    }
  });

  it('should publish an async resource and abort it on cleanup', async () => {
    let settle: (value: string) => void = () => {};
    let loaderSignal: AbortSignal | null = null;
    let setups = 0;
    const Page = defineSetupComponent(() => {
      setups++;
      const result = resource(({ signal }) => {
        loaderSignal = signal;
        return new Promise<string>((resolve) => {
          settle = resolve;
        });
      });
      return () => <p>{result.value ?? 'pending'}</p>;
    });
    const { container, cleanup } = createTestContainer();
    const registry = routeRegistryFromTable([{ path: '/', handler: Page }]);

    try {
      await createSPA({ root: container, registry });
      flushScheduler();
      await waitForNextEvaluation();
      expect(container.textContent).toBe('pending');
      settle('ready');
      await waitForNextEvaluation();
      flushScheduler();
      expect(container.textContent).toBe('ready');
      expect(setups).toBe(1);
    } finally {
      cleanup();
    }
    expect(loaderSignal?.aborted).toBe(true);
  });

  it('should own a watch and cancel a pending resource when removed', async () => {
    let active: ReturnType<typeof state<boolean>>;
    let count: ReturnType<typeof state<number>>;
    let loaderSignal: AbortSignal | null = null;
    const observed: number[] = [];
    let watchCleanups = 0;
    const Child = defineSetupComponent(() => {
      count = state(0);
      watch(count, (value) => {
        observed.push(value);
        return () => {
          watchCleanups++;
        };
      });
      resource(({ signal }) => {
        loaderSignal = signal;
        return new Promise<string>(() => {});
      });
      return () => <p>{count()}</p>;
    });
    const Page = () => {
      active = state(true);
      return <main>{active() ? <Child /> : null}</main>;
    };
    const { container, cleanup } = createTestContainer();
    const registry = routeRegistryFromTable([{ path: '/', handler: Page }]);

    try {
      await createSPA({ root: container, registry });
      flushScheduler();
      await waitForNextEvaluation();
      expect(observed).toEqual([0]);
      expect(loaderSignal?.aborted).toBe(false);
      count!.set(1);
      flushScheduler();
      expect(observed).toEqual([0, 1]);
      active!.set(false);
      flushScheduler();
      expect(container.querySelector('p')).toBeNull();
      expect(loaderSignal?.aborted).toBe(true);
      expect(watchCleanups).toBe(2);
    } finally {
      cleanup();
    }
  });
});
