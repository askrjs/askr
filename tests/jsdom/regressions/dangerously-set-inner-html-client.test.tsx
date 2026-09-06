import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { logger } from '../../../src/common/logger';
import { state } from '../../../src/index';
import { getKeyMapForElement } from '../../../src/renderer/reconciliation/keyed';
import { resource, task } from '../../../src/resources';
import { renderToStringSync } from '../../../src/ssr';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('dangerouslySetInnerHTML on the client renderer', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const ctx = createTestContainer();
    container = ctx.container;
    cleanup = ctx.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should set innerHTML instead of writing a garbage attribute', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});

    createIsland({
      root: container,
      component: () => (
        <div dangerouslySetInnerHTML={{ __html: '<b>hi</b>' }} />
      ),
    });
    flushScheduler();

    const div = container.querySelector('div');
    expect(div?.innerHTML).toBe('<b>hi</b>');
    expect(div?.hasAttribute('dangerouslysetinnerhtml')).toBe(false);
    expect(div?.hasAttribute('dangerouslySetInnerHTML')).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('dangerouslySetInnerHTML is being used')
    );
    warn.mockRestore();
  });

  it('should give valid dangerous HTML precedence over initial JSX children and match SSR', () => {
    let childRenders = 0;

    function ManagedChild() {
      childRenders += 1;
      return <span data-managed={'true'}>{'managed'}</span>;
    }

    function App() {
      return (
        <div dangerouslySetInnerHTML={{ __html: '<b data-raw>raw</b>' }}>
          <ManagedChild />
        </div>
      );
    }

    const serverHTML = renderToStringSync(App);
    const serverContainer = document.createElement('div');
    serverContainer.innerHTML = serverHTML;
    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('div')?.outerHTML).toBe(
      serverContainer.querySelector('div')?.outerHTML
    );
    expect(container.querySelector('[data-raw]')?.textContent).toBe('raw');
    expect(container.querySelector('[data-managed]')).toBeNull();
    expect(childRenders).toBe(0);
  });

  it('should update innerHTML when __html changes on a later render', () => {
    let html: ReturnType<typeof state<string>> | null = null;

    createIsland({
      root: container,
      component: () => {
        html = state('<b>first</b>');
        return <div dangerouslySetInnerHTML={{ __html: html!() }} />;
      },
    });
    flushScheduler();

    expect(container.querySelector('div')?.innerHTML).toBe('<b>first</b>');

    html!.set('<i>second</i>');
    flushScheduler();

    expect(container.querySelector('div')?.innerHTML).toBe('<i>second</i>');
  });

  it('should tear down a managed child before retained dangerous HTML takes ownership', async () => {
    let useDangerousHTML!: ReturnType<typeof state<boolean>>;
    let cleanups = 0;
    let aborts = 0;
    let clicks = 0;
    const refValues: Array<Element | null> = [];

    function ManagedChild() {
      resource(
        ({ signal }) =>
          new Promise<string>(() => {
            signal.addEventListener('abort', () => {
              aborts += 1;
            });
          }),
        []
      );
      task(() => () => {
        cleanups += 1;
      });

      return (
        <button
          data-managed={'true'}
          ref={(element) => {
            refValues.push(element);
          }}
          onClickCapture={() => {
            clicks += 1;
          }}
        >
          {'managed'}
        </button>
      );
    }

    function App() {
      useDangerousHTML = state(false);
      return (
        <section
          data-host={'true'}
          dangerouslySetInnerHTML={
            useDangerousHTML() ? { __html: '<i data-raw>raw</i>' } : undefined
          }
        >
          <ManagedChild />
        </section>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();
    await Promise.resolve();
    await Promise.resolve();

    const host = container.querySelector('[data-host]')!;
    const managed = container.querySelector('[data-managed]')!;
    expect(refValues).toEqual([managed]);

    useDangerousHTML.set(true);
    flushScheduler();

    expect(container.querySelector('[data-host]')).toBe(host);
    expect(container.querySelector('[data-managed]')).toBeNull();
    expect(container.querySelector('[data-raw]')?.textContent).toBe('raw');
    expect(managed.isConnected).toBe(false);
    expect(cleanups).toBe(1);
    expect(aborts).toBe(1);
    expect(refValues).toEqual([managed, null]);

    managed.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicks).toBe(0);
  });

  it('should treat absent and malformed payloads like an omitted prop', () => {
    let payload!: ReturnType<typeof state<unknown>>;
    let count!: ReturnType<typeof state<number>>;
    const refValues: Array<Element | null> = [];
    const managedRef = (element: Element | null) => {
      refValues.push(element);
    };

    function ManagedChild() {
      count = state(0);
      return (
        <button data-managed={'true'} ref={managedRef}>
          {`count:${count()}`}
        </button>
      );
    }

    function App() {
      payload = state<unknown>(undefined);
      return (
        <section data-host={'true'} dangerouslySetInnerHTML={payload()}>
          <ManagedChild />
        </section>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();

    const host = container.querySelector('[data-host]')!;
    const managed = container.querySelector('[data-managed]')!;
    expect(refValues).toEqual([managed]);

    for (const invalidPayload of [
      null,
      false,
      {},
      'invalid',
      () => ({
        __html: '<i>not evaluated</i>',
      }),
    ]) {
      payload.set(
        typeof invalidPayload === 'function'
          ? () => invalidPayload
          : invalidPayload
      );
      flushScheduler();
      expect(container.querySelector('[data-host]')).toBe(host);
      expect(container.querySelector('[data-managed]')).toBe(managed);
      expect(refValues).toEqual([managed]);
    }

    count.set(1);
    flushScheduler();
    expect(container.querySelector('[data-managed]')).toBe(managed);
    expect(managed.textContent).toBe('count:1');
  });

  it('should alternate between dangerous HTML and keyed managed children without stale ownership', async () => {
    let useDangerousHTML!: ReturnType<typeof state<boolean>>;
    let cleanups = 0;
    const refValues: Array<Element | null> = [];

    function ManagedChild({ id }: { id: string }) {
      task(() => () => {
        cleanups += 1;
      });
      return (
        <span
          data-managed={id}
          ref={(element) => {
            refValues.push(element);
          }}
        >
          {id}
        </span>
      );
    }

    function App() {
      useDangerousHTML = state(true);
      return (
        <section
          data-host={'true'}
          dangerouslySetInnerHTML={
            useDangerousHTML() ? { __html: '<i data-raw>raw</i>' } : undefined
          }
        >
          <ManagedChild key={'a'} id={'a'} />
          <ManagedChild key={'b'} id={'b'} />
        </section>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();
    const host = container.querySelector('[data-host]')!;

    expect(container.querySelectorAll('[data-raw]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-managed]')).toHaveLength(0);

    useDangerousHTML.set(false);
    flushScheduler();
    await Promise.resolve();
    await Promise.resolve();
    const firstManaged = Array.from(
      container.querySelectorAll('[data-managed]')
    );
    expect(firstManaged).toHaveLength(2);
    expect(getKeyMapForElement(host)?.size).toBe(2);

    useDangerousHTML.set(true);
    flushScheduler();
    expect(container.querySelector('[data-host]')).toBe(host);
    expect(container.querySelectorAll('[data-raw]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-managed]')).toHaveLength(0);
    expect(getKeyMapForElement(host)).toBeUndefined();
    expect(cleanups).toBe(2);
    expect(refValues.filter((value) => value === null)).toHaveLength(2);

    useDangerousHTML.set(false);
    flushScheduler();
    await Promise.resolve();
    await Promise.resolve();
    const secondManaged = Array.from(
      container.querySelectorAll('[data-managed]')
    );
    expect(secondManaged).toHaveLength(2);
    expect(secondManaged[0]).not.toBe(firstManaged[0]);
    expect(secondManaged[1]).not.toBe(firstManaged[1]);
    expect(new Set(secondManaged).size).toBe(2);

    useDangerousHTML.set(true);
    flushScheduler();
    expect(container.querySelectorAll('[data-raw]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-managed]')).toHaveLength(0);
    expect(getKeyMapForElement(host)).toBeUndefined();
    expect(cleanups).toBe(4);
    expect(refValues.filter((value) => value === null)).toHaveLength(4);
  });
});
