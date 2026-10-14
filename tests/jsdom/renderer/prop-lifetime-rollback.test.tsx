import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createRoot, type Root } from '../../../src/core/dom/root';
import { Signal } from '../../../src/core/reactive/graph';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

let root: Root | undefined;
let cleanup: (() => void) | undefined;

afterEach(() => {
  root?.dispose();
  root = undefined;
  cleanup?.();
  cleanup = undefined;
  vi.restoreAllMocks();
});

describe('host prop lifetime rollback and retry', () => {
  it('should discard provisional lifetimes after failed adoption and install them once on retry', () => {
    const fixture = createTestContainer();
    cleanup = fixture.cleanup;
    const container = fixture.container;
    container.innerHTML =
      '<button id="first" class="server">first</button>' +
      '<button id="second" data-mode="server">second</button>';
    const first = container.querySelector<HTMLButtonElement>('#first')!;
    const second = container.querySelector('#second')!;
    const value = new Signal('client');
    const read = () => value.read();
    const click = vi.fn();
    const ref = vi.fn<(element: Element | null) => void>();
    const view = () => (
      <>
        <button id="first" className={read as never} onClick={click} ref={ref}>
          first
        </button>
        <button id="second" data-mode="client">
          second
        </button>
      </>
    );
    root = createRoot(container, { hydrate: true });
    const originalWrite = second.setAttribute.bind(second);
    const failure = new Error('later adoption write failed');
    const write = vi
      .spyOn(second, 'setAttribute')
      .mockImplementation((name, text) => {
        if (name === 'data-mode' && text === 'client') throw failure;
        originalWrite(name, text);
      });

    const prepared = root.prepare(view());
    expect(() => prepared.commit()).toThrow(failure);
    expect(container.querySelector('#first')).toBe(first);
    expect(first.className).toBe('server');
    expect(ref).not.toHaveBeenCalled();
    first.click();
    expect(click).not.toHaveBeenCalled();
    value.write('changed-before-retry');
    flushScheduler();
    expect(first.className).toBe('server');

    write.mockRestore();
    root.render(view());
    expect(container.querySelector('#first')).toBe(first);
    expect(first.className).toBe('changed-before-retry');
    expect(ref.mock.calls).toEqual([[first]]);
    first.click();
    expect(click).toHaveBeenCalledTimes(1);
    value.write('active');
    flushScheduler();
    expect(first.className).toBe('active');
    root.dispose();
    root = undefined;
    expect(ref.mock.calls).toEqual([[first], [null]]);
    first.click();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])(
    'should preserve committed listeners, bindings and refs after a failed patch (adopted: %s)',
    (adopted) => {
      const fixture = createTestContainer();
      cleanup = fixture.cleanup;
      const container = fixture.container;
      if (adopted) {
        container.innerHTML =
          '<button id="first" class="old">first</button>' +
          '<button id="second" data-mode="old">second</button>';
      }
      const serverFirst = container.firstElementChild;
      const oldValue = new Signal('old');
      const nextValue = new Signal('replacement');
      const oldRead = () => oldValue.read();
      const nextRead = () => nextValue.read();
      const oldClick = vi.fn();
      const nextClick = vi.fn();
      const oldRef = vi.fn<(element: Element | null) => void>();
      const nextRef = vi.fn<(element: Element | null) => void>();
      const view = (replacement: boolean) => (
        <>
          <button
            id="first"
            className={(replacement ? nextRead : oldRead) as never}
            onClick={replacement ? nextClick : oldClick}
            ref={replacement ? nextRef : oldRef}
          >
            first
          </button>
          <button id="second" data-mode={replacement ? 'new' : 'old'}>
            second
          </button>
        </>
      );
      root = createRoot(container, { hydrate: adopted });
      root.render(view(false));
      const first = container.querySelector<HTMLButtonElement>('#first')!;
      const second = container.querySelector('#second')!;
      if (adopted) expect(first).toBe(serverFirst);
      expect(oldRef.mock.calls).toEqual([[first]]);
      const originalWrite = second.setAttribute.bind(second);
      const failure = new Error('later host write failed');
      const write = vi
        .spyOn(second, 'setAttribute')
        .mockImplementation((name, value) => {
          if (name === 'data-mode' && value === 'new') throw failure;
          originalWrite(name, value);
        });

      const prepared = root.prepare(view(true));
      expect(() => prepared.commit()).toThrow(failure);
      expect(container.querySelector('#first')).toBe(first);
      expect(first.className).toBe('old');
      expect(oldRef.mock.calls).toEqual([[first]]);
      expect(nextRef).not.toHaveBeenCalled();
      first.click();
      expect(oldClick).toHaveBeenCalledTimes(1);
      expect(nextClick).not.toHaveBeenCalled();
      oldValue.write('old-still-active');
      nextValue.write('uncommitted');
      flushScheduler();
      expect(first.className).toBe('old-still-active');

      write.mockRestore();
      root.render(view(true));
      expect(container.querySelector('#first')).toBe(first);
      expect(first.className).toBe('uncommitted');
      expect(oldRef.mock.calls).toEqual([[first], [null]]);
      expect(nextRef.mock.calls).toEqual([[first]]);
      first.click();
      expect(oldClick).toHaveBeenCalledTimes(1);
      expect(nextClick).toHaveBeenCalledTimes(1);
      oldValue.write('retired');
      nextValue.write('replacement-active');
      flushScheduler();
      expect(first.className).toBe('replacement-active');

      root.dispose();
      root = undefined;
      expect(nextRef.mock.calls).toEqual([[first], [null]]);
      nextValue.write('released');
      flushScheduler();
      first.click();
      expect(first.className).toBe('replacement-active');
      expect(nextClick).toHaveBeenCalledTimes(1);
    }
  );
});
