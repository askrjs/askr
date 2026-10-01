import { afterEach, describe, expect, it } from 'vite-plus/test';
import { createRoot, type Root } from '../../../src/core/dom/root';
import { clearScheduler } from '../../../src/core/reactive/scheduler';

let root: Root | undefined;

afterEach(() => {
  root?.dispose();
  root = undefined;
  clearScheduler();
});

describe('ref replacement failures', () => {
  it('attaches the replacement ref even when the previous callback fails during cleanup', () => {
    const container = document.createElement('div');
    const failure = new Error('previous ref cleanup failed');
    const calls: Array<Element | null> = [];
    const previous = (element: Element | null) => {
      calls.push(element);
      if (element === null) throw failure;
    };
    const replacement = { current: null as Element | null };
    root = createRoot(container);
    root.render(<span ref={previous}>initial</span>);
    const element = container.firstElementChild;

    expect(() => root!.render(<span ref={replacement}>updated</span>)).toThrow(
      failure
    );

    expect(container.firstElementChild).toBe(element);
    expect(container.textContent).toBe('updated');
    expect(replacement.current).toBe(element);
    expect(calls).toEqual([element, null]);

    root.dispose();

    expect(replacement.current).toBeNull();
    expect(calls).toEqual([element, null]);
  });

  it('reports both ref failures after attempting old cleanup and replacement attachment', () => {
    const container = document.createElement('div');
    const cleanupFailure = new Error('previous ref cleanup failed');
    const attachFailure = new Error('replacement attachment failed');
    const calls: string[] = [];
    const previous = (element: Element | null) => {
      if (element) return;
      calls.push('cleanup');
      throw cleanupFailure;
    };
    const replacement = (element: Element | null) => {
      if (!element) return;
      calls.push('attachment');
      throw attachFailure;
    };
    root = createRoot(container);
    root.render(<span ref={previous}>initial</span>);
    let reported: unknown;

    try {
      root.render(<span ref={replacement}>updated</span>);
    } catch (error) {
      reported = error;
    }

    expect(calls).toEqual(['cleanup', 'attachment']);
    expect(reported).toBeInstanceOf(AggregateError);
    expect((reported as AggregateError).errors).toEqual([
      cleanupFailure,
      attachFailure,
    ]);
    expect(container.textContent).toBe('updated');
  });
});
