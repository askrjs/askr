import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { state } from '../../../src';
import { createRoot } from '../../../src/core/dom/root';
import { task } from '../../../src/resources';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

function failInnerHTMLOnce(
  element: Element,
  html: string,
  failure: Error
): () => void {
  let prototype = Object.getPrototypeOf(element) as object | null;
  let descriptor: PropertyDescriptor | undefined;
  while (prototype && !descriptor) {
    descriptor = Object.getOwnPropertyDescriptor(prototype, 'innerHTML');
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  if (!descriptor?.get || !descriptor.set)
    throw new Error('Expected a native innerHTML accessor');

  let shouldThrow = true;
  Object.defineProperty(element, 'innerHTML', {
    configurable: true,
    get() {
      return descriptor!.get!.call(this);
    },
    set(value: string) {
      descriptor!.set!.call(this, value);
      if (shouldThrow && value === html) {
        shouldThrow = false;
        throw failure;
      }
    },
  });
  return () => {
    shouldThrow = false;
  };
}

describe('dangerouslySetInnerHTML rollback', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => cleanup());

  it('should restore the exact prior raw nodes when the innerHTML setter throws', () => {
    let setHTML!: (value: string) => void;
    const failure = new Error('innerHTML setter failed');
    const App = () => {
      const html = state('<b>first</b>');
      setHTML = html.set;
      return <div dangerouslySetInnerHTML={{ __html: html() }} />;
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    const host = container.querySelector('div')!;
    const before = host.firstChild;
    const restoreSetter = failInnerHTMLOnce(host, '<i>second</i>', failure);

    expect(() => {
      setHTML('<i>second</i>');
      flushScheduler();
    }).toThrow(failure);
    expect(host.firstChild).toBe(before);
    expect(host.innerHTML).toBe('<b>first</b>');

    restoreSetter();
    setHTML('<b>first</b>');
    flushScheduler();
    setHTML('<i>second</i>');
    flushScheduler();
    expect(host.innerHTML).toBe('<i>second</i>');
  });

  it('should keep managed children owned when a later write aborts raw HTML', async () => {
    let setRaw!: (value: boolean) => void;
    let cleanupCount = 0;
    const refs: Array<Element | null> = [];
    const failure = new Error('managed to raw HTML failed');

    const ManagedChild = () => {
      task(() => () => {
        cleanupCount += 1;
      });
      return (
        <button
          data-managed="true"
          ref={(element) => {
            refs.push(element);
          }}
        >
          managed
        </button>
      );
    };
    const App = () => {
      const raw = state(false);
      setRaw = raw.set;
      return (
        <section
          title={raw() ? 'after' : 'before'}
          dangerouslySetInnerHTML={
            raw() ? { __html: '<i data-raw>raw</i>' } : undefined
          }
        >
          <ManagedChild />
        </section>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    await Promise.resolve();
    await Promise.resolve();
    const host = container.querySelector('section')!;
    const managed = host.querySelector('button')!;
    const setAttribute = host.setAttribute.bind(host);
    let shouldThrow = true;
    vi.spyOn(host, 'setAttribute').mockImplementation((name, value) => {
      setAttribute(name, value);
      if (shouldThrow && name === 'title' && value === 'after') {
        shouldThrow = false;
        throw failure;
      }
    });

    expect(() => {
      setRaw(true);
      flushScheduler();
    }).toThrow(failure);
    expect(host.firstChild).toBe(managed);
    expect(host.getAttribute('title')).toBe('before');
    expect(cleanupCount).toBe(0);
    expect(refs).toEqual([managed]);

    shouldThrow = false;
    setRaw(false);
    flushScheduler();
    setRaw(true);
    flushScheduler();
    expect(host.querySelector('[data-raw]')?.textContent).toBe('raw');
    expect(host.querySelector('[data-managed]')).toBeNull();
    expect(cleanupCount).toBe(1);
    expect(refs).toEqual([managed, null]);
  });

  it('should restore exact raw nodes when managed child placement aborts', () => {
    let setManaged!: (value: boolean) => void;
    const App = () => {
      const managed = state(false);
      setManaged = managed.set;
      return (
        <section
          dangerouslySetInnerHTML={
            managed() ? undefined : { __html: '<i data-raw>raw</i>' }
          }
        >
          {managed() ? <span data-managed="true">managed</span> : null}
        </section>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    const host = container.querySelector('section')!;
    const raw = host.firstChild;
    const insertBefore = host.insertBefore.bind(host);
    let shouldThrow = true;
    vi.spyOn(host, 'insertBefore').mockImplementation((node, reference) => {
      insertBefore(node, reference);
      if (shouldThrow) {
        shouldThrow = false;
        throw new Error('managed child insertion failed');
      }
      return node;
    });

    expect(() => {
      setManaged(true);
      flushScheduler();
    }).toThrow('managed child insertion failed');
    expect(host.firstChild).toBe(raw);
    expect(host.querySelector('[data-managed]')).toBeNull();

    setManaged(false);
    flushScheduler();
    setManaged(true);
    flushScheduler();
    expect(host.querySelectorAll('[data-managed]')).toHaveLength(1);
    expect(host.querySelector('[data-raw]')).toBeNull();
  });

  it('should restore adopted server nodes when initial raw HTML assignment aborts', () => {
    const container = document.createElement('div');
    container.innerHTML = '<section><b data-server>server</b></section>';
    const host = container.firstElementChild!;
    const serverNode = host.firstChild;
    const failure = new Error('adopted innerHTML setter failed');
    const restoreSetter = failInnerHTMLOnce(host, '<i>client</i>', failure);
    const root = createRoot(container, { hydrate: true });

    expect(() =>
      root
        .prepare(
          <section dangerouslySetInnerHTML={{ __html: '<i>client</i>' }} />
        )
        .commit()
    ).toThrow(failure);
    expect(host.firstChild).toBe(serverNode);
    expect(host.innerHTML).toBe('<b data-server="">server</b>');

    restoreSetter();
    root
      .prepare(
        <section dangerouslySetInnerHTML={{ __html: '<i>client</i>' }} />
      )
      .commit();
    expect(host.innerHTML).toBe('<i>client</i>');
    root.dispose();
  });
});
