import { describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src';
import { For, Show } from '../../../src/control';
import { Presence } from '../../../src/foundations';
import { getCurrentComponentInstance } from '../../../src/runtime/component';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('client control-boundary reconciliation', () => {
  it('should remove consecutive inactive boundaries before mounting one keyed workspace', () => {
    const { container, cleanup } = createTestContainer();
    let setRows!: (rows: Array<{ id: string }>) => void;
    let setActive!: (id: string | null) => void;
    let mounts = 0;
    let cleanups = 0;

    const Workspace = ({ id }: { id: string }) => {
      const instance = getCurrentComponentInstance();
      if (!instance) throw new Error('expected workspace instance');
      if (!instance.mounted) {
        mounts += 1;
        (instance.cleanupFns ??= []).push(() => {
          cleanups += 1;
        });
      }
      return <section data-workspace={id}>{`workspace-${id}`}</section>;
    };

    const App = () => {
      const rows = state<Array<{ id: string }>>([]);
      const active = state<string | null>(null);
      setRows = rows.set;
      setActive = active.set;

      return (
        <main>
          <Show when={rows().length === 0}>
            <p data-empty={'true'}>{'empty'}</p>
          </Show>
          <Show when={false}>
            <p data-secondary-empty={'true'}>{'secondary'}</p>
          </Show>
          <For
            each={rows().filter((row) => row.id === active())}
            by={(row) => row.id}
          >
            {(row) => <Workspace id={row.id} />}
          </For>
        </main>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      expect(container.querySelectorAll('[data-empty]')).toHaveLength(1);

      setRows([{ id: 'a' }]);
      setActive('a');
      flushScheduler();

      const firstWorkspace = container.querySelector('[data-workspace="a"]');
      expect(firstWorkspace).not.toBeNull();
      expect(container.querySelectorAll('[data-workspace]')).toHaveLength(1);
      expect(container.querySelector('[data-empty]')).toBeNull();

      setRows([{ id: 'a' }, { id: 'b' }]);
      flushScheduler();
      expect(container.querySelector('[data-workspace="a"]')).toBe(
        firstWorkspace
      );

      setActive('b');
      flushScheduler();
      expect(container.querySelectorAll('[data-workspace]')).toHaveLength(1);
      expect(container.querySelector('[data-workspace="b"]')).not.toBeNull();
      expect(mounts).toBe(2);
      expect(cleanups).toBe(1);

      setRows([]);
      setActive(null);
      flushScheduler();
      setRows([{ id: 'a' }]);
      setActive('a');
      flushScheduler();
      expect(container.querySelectorAll('[data-workspace]')).toHaveLength(1);
      expect(container.querySelector('[data-empty]')).toBeNull();
      expect(mounts).toBe(3);
      expect(cleanups).toBe(2);
    } finally {
      cleanup();
    }
  });

  it('should remove a Presence fragment when a component closes and permit reopen', () => {
    const { container, cleanup } = createTestContainer();
    let setOpen!: (open: boolean) => void;
    let mounts = 0;
    let cleanups = 0;

    const Content = () => {
      const instance = getCurrentComponentInstance();
      if (!instance) throw new Error('expected content instance');
      if (!instance.mounted) {
        mounts += 1;
        (instance.cleanupFns ??= []).push(() => {
          cleanups += 1;
        });
      }
      return <div data-presence-content={'true'}>{'content'}</div>;
    };

    const PresenceBranch = ({ open }: { open: boolean }) => (
      <Presence present={open}>
        <Content />
      </Presence>
    );

    const App = () => {
      const open = state(true);
      setOpen = open.set;
      return (
        <section>
          <PresenceBranch open={open()} />
          <span data-static={'true'}>{'static'}</span>
        </section>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      expect(
        container.querySelectorAll('[data-presence-content]')
      ).toHaveLength(1);

      setOpen(false);
      flushScheduler();
      expect(container.querySelector('[data-presence-content]')).toBeNull();
      expect(container.querySelector('[data-static]')?.textContent).toBe(
        'static'
      );
      expect(cleanups).toBe(1);

      setOpen(true);
      flushScheduler();
      expect(
        container.querySelectorAll('[data-presence-content]')
      ).toHaveLength(1);
      expect(mounts).toBe(2);
      expect(cleanups).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('should not adopt identical-looking unowned DOM during a client mount', () => {
    const { container, cleanup } = createTestContainer();
    let setVisible!: (visible: boolean) => void;
    let clicks = 0;

    const OwnedButton = () => (
      <button
        type="button"
        data-client-owned={'true'}
        onClick={() => {
          clicks += 1;
        }}
      >
        {'ready'}
      </button>
    );

    const App = () => {
      const visible = state(false);
      setVisible = visible.set;
      return <main>{visible() ? <OwnedButton /> : null}</main>;
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      const main = container.querySelector('main')!;
      const stale = document.createElement('button');
      stale.type = 'button';
      stale.dataset.clientOwned = 'false';
      stale.textContent = 'ready';
      main.appendChild(stale);

      setVisible(true);
      flushScheduler();
      const current = main.querySelector('button') as HTMLButtonElement;
      expect(current).not.toBe(stale);
      expect(current.dataset.clientOwned).toBe('true');
      current.click();
      expect(clicks).toBe(1);
    } finally {
      cleanup();
    }
  });
});
