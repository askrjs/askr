import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { defineScope, state } from '../../../src';
import { createIsland } from '../../../src/boot';
import { resource } from '../../../src/resources';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('resource and event state subscriptions', () => {
  let container: HTMLDivElement;
  let cleanup: () => void;

  beforeEach(() => {
    const testRoot = createTestContainer();
    container = testRoot.container;
    cleanup = testRoot.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should keep event-driven state updates live after a resource-driven rerender', () => {
    const Component = () => {
      const collapsed = state(false);
      const open = state(false);

      resource(() => {
        collapsed.set(true);
        return null;
      }, []);

      return (
        <button
          data-collapsed={collapsed() ? 'true' : 'false'}
          data-open={open() ? 'true' : 'false'}
          type="button"
          onClick={() => {
            open.set(true);
          }}
        >
          Toggle
        </button>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const button = container.querySelector(
      'button'
    ) as HTMLButtonElement | null;
    expect(button?.getAttribute('data-collapsed')).toBe('true');
    expect(button?.getAttribute('data-open')).toBe('false');

    button?.click();
    flushScheduler();

    expect(button?.getAttribute('data-collapsed')).toBe('true');
    expect(button?.getAttribute('data-open')).toBe('true');
  });

  it('should rerender a parent when a child event updates parent-owned state', () => {
    const Child = (props: { onToggle: () => void }) => (
      <button type="button" onClick={props.onToggle}>
        Toggle
      </button>
    );
    const Component = () => {
      const open = state(false);

      return (
        <section data-open={open() ? 'true' : 'false'}>
          <Child
            onToggle={() => {
              open.set(true);
            }}
          />
        </section>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const section = container.querySelector('section') as HTMLElement | null;
    const button = container.querySelector(
      'button'
    ) as HTMLButtonElement | null;

    expect(section?.getAttribute('data-open')).toBe('false');

    button?.click();
    flushScheduler();

    expect(section?.getAttribute('data-open')).toBe('true');
  });

  it('should keep child event handlers live after a resource updates parent state', () => {
    const Child = (props: { onToggle: () => void }) => (
      <button type="button" onClick={props.onToggle}>
        Toggle
      </button>
    );
    const Component = () => {
      const collapsed = state(false);
      const open = state(false);

      resource(() => {
        collapsed.set(true);
        return null;
      }, []);

      return (
        <section
          data-collapsed={collapsed() ? 'true' : 'false'}
          data-open={open() ? 'true' : 'false'}
        >
          <Child
            onToggle={() => {
              open.set(true);
            }}
          />
        </section>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const section = container.querySelector('section') as HTMLElement | null;
    const button = container.querySelector(
      'button'
    ) as HTMLButtonElement | null;

    expect(section?.getAttribute('data-collapsed')).toBe('true');
    expect(section?.getAttribute('data-open')).toBe('false');

    button?.click();
    flushScheduler();

    expect(section?.getAttribute('data-collapsed')).toBe('true');
    expect(section?.getAttribute('data-open')).toBe('true');
  });

  it('should keep context-wrapped parent state live after a resource rerender', () => {
    const LayoutScope = defineScope('default');
    const Child = (props: { onOpen: () => void }) => (
      <button type="button" onClick={props.onOpen}>
        Open
      </button>
    );
    const Component = () => {
      const compact = state(false);
      const open = state(false);

      resource(() => {
        compact.set(true);
        return null;
      }, []);

      return (
        <LayoutScope value={compact() ? 'compact' : 'wide'}>
          <section
            data-compact={compact() ? 'true' : 'false'}
            data-open={open() ? 'true' : 'false'}
          >
            <Child
              onOpen={() => {
                open.set(true);
              }}
            />
          </section>
        </LayoutScope>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const section = container.querySelector('section') as HTMLElement | null;
    const button = container.querySelector(
      'button'
    ) as HTMLButtonElement | null;

    expect(section?.getAttribute('data-compact')).toBe('true');
    expect(section?.getAttribute('data-open')).toBe('false');

    button?.click();
    flushScheduler();

    expect(section?.getAttribute('data-compact')).toBe('true');
    expect(section?.getAttribute('data-open')).toBe('true');
  });
});
