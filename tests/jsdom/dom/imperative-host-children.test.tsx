import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src';
import { renderToStringSync } from '../../../src/ssr';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('imperative host children', () => {
  let container: HTMLDivElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanup();
  });

  it('should preserve focused imperative descendants across parent updates', () => {
    let update!: () => void;

    function App() {
      const revision = state(0);
      update = () => revision.set((current) => current + 1);

      return (
        <div
          data-revision={revision()}
          data-testid="widget-host"
          imperativeChildren
        />
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();

    const host = container.querySelector('[data-testid="widget-host"]')!;
    const input = document.createElement('input');
    host.appendChild(input);
    input.focus();

    update();
    flushScheduler();

    expect(container.querySelector('[data-testid="widget-host"]')).toBe(host);
    expect(host.firstChild).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(host.getAttribute('data-revision')).toBe('1');
    expect(host.hasAttribute('imperativechildren')).toBe(false);
  });

  it('should continue clearing undeclared descendants from managed hosts', () => {
    let update!: () => void;

    function App() {
      const revision = state(0);
      update = () => revision.set((current) => current + 1);

      return <div data-revision={revision()} data-testid="managed-host" />;
    }

    createIsland({ root: container, component: App });
    flushScheduler();

    const host = container.querySelector('[data-testid="managed-host"]')!;
    const child = document.createElement('span');
    host.appendChild(child);

    update();
    flushScheduler();

    expect(host.firstChild).toBeNull();
    expect(host.getAttribute('data-revision')).toBe('1');
  });

  it('should not serialize the ownership marker during SSR', () => {
    expect(
      renderToStringSync(() => (
        <div imperativeChildren data-testid="widget-host" />
      ))
    ).toBe('<div data-testid="widget-host"></div>');
  });

  it('should not materialize the ownership marker on a keyed first render', () => {
    function App() {
      return (
        <div imperativeChildren data-testid="widget-host">
          {[<span key="first">one</span>, <span key="second">two</span>]}
        </div>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();

    const host = container.querySelector('[data-testid="widget-host"]')!;
    expect(host.hasAttribute('imperativechildren')).toBe(false);
    expect(host.textContent).toBe('onetwo');
  });
});
