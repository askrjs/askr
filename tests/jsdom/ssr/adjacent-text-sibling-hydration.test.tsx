import { afterEach, describe, expect, it } from 'vite-plus/test';
import { createRoot, type Root } from '../../../src/core/dom/root';
import { HydrationCursor } from '../../../src/core/dom/hydration';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('hydrating adjacent text before existing siblings', () => {
  let root: Root | undefined;
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    root?.dispose();
    root = undefined;
    cleanup?.();
    cleanup = undefined;
    flushScheduler();
  });

  it('should adopt the following element after several detached text suffixes', () => {
    const test = createTestContainer();
    cleanup = test.cleanup;
    test.container.innerHTML =
      '<p>ABCD<button>go</button><input value="server"></p>';
    const paragraph = test.container.querySelector('p')!;
    const text = paragraph.firstChild;
    const button = paragraph.querySelector('button');
    const input = paragraph.querySelector('input')!;
    input.value = 'browser';
    const clicks: string[] = [];
    const Page = () => (
      <p>
        {'A'}
        {'B'}
        {'C'}
        {'D'}
        <button onClick={() => clicks.push('clicked')}>go</button>
        <input />
      </p>
    );
    root = createRoot(test.container, { hydrate: true });

    const prepared = root.prepare(<Page />);

    expect(paragraph.firstChild).toBe(text);
    expect(text?.textContent).toBe('ABCD');
    expect(paragraph.querySelector('button')).toBe(button);
    expect(input.value).toBe('browser');
    expect(prepared.discard()).toEqual([]);
    expect(paragraph.innerHTML).toBe(
      'ABCD<button>go</button><input value="server">'
    );

    root.render(<Page />);

    expect(test.container.querySelector('p')).toBe(paragraph);
    expect(paragraph.querySelector('button')).toBe(button);
    expect(paragraph.querySelector('input')).toBe(input);
    expect(input.value).toBe('browser');
    button?.click();
    expect(clicks).toEqual(['clicked']);
  });

  it('should retain a detached suffix successor in a reserved cursor', () => {
    const container = document.createElement('p');
    container.innerHTML = 'AB<button>go</button>';
    const text = container.firstChild;
    const button = container.querySelector('button');
    const cursor = new HydrationCursor();
    expect(cursor.claimText(container, 'A')).toBe(text);
    const reserved = cursor.reserve(container);

    expect(reserved.claimText(container, 'B')?.data).toBe('B');
    expect(reserved.claimElement(container, 'button', null)).toBe(button);
    expect(container.innerHTML).toBe('AB<button>go</button>');
  });
});
