import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state, derive } from '../../../src/index';
import type { State } from '../../../src/runtime/state';
import type { Derived } from '../../../src/runtime/derive';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

// Coverage for ONE reactive source read by MULTIPLE distinct component
// subscribers — the fan-out, reader-drop, and double-read-dedupe paths in
// src/runtime/readable.ts (notifyReadableReaders / finalizeReadableSubscriptions).
//
// Pattern: a parent owns the source and passes its getter down to sibling child
// components. The parent itself does NOT read the source, so only the children
// are subscribers — isolating the multi-subscriber fan-out from parent re-render.

describe('shared reactive source — multiple subscribers', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });
  afterEach(() => cleanup());

  it('should re-render every component subscribed to a shared state exactly once on set', () => {
    let parentRenders = 0;
    let aRenders = 0;
    let bRenders = 0;
    let shared!: State<number>;

    const ChildA = (props: { count: () => number }) => {
      aRenders += 1;
      return <span data-testid="a">{props.count()}</span>;
    };
    const ChildB = (props: { count: () => number }) => {
      bRenders += 1;
      return <span data-testid="b">{props.count()}</span>;
    };

    const Parent = () => {
      parentRenders += 1;
      shared = state(0); // owned here, NOT read here
      return (
        <div>
          <ChildA count={shared} />
          <ChildB count={shared} />
        </div>
      );
    };

    createIsland({ root: container, component: Parent });
    flushScheduler();
    expect(container.querySelector('[data-testid="a"]')?.textContent).toBe('0');
    expect(container.querySelector('[data-testid="b"]')?.textContent).toBe('0');

    const p0 = parentRenders;
    const a0 = aRenders;
    const b0 = bRenders;

    shared.set(1);
    flushScheduler();

    // Both subscribers update; parent (a non-reader) does not re-render.
    expect(container.querySelector('[data-testid="a"]')?.textContent).toBe('1');
    expect(container.querySelector('[data-testid="b"]')?.textContent).toBe('1');
    expect(aRenders).toBe(a0 + 1);
    expect(bRenders).toBe(b0 + 1);
    expect(parentRenders).toBe(p0);
  });

  it('should stop notifying a component that no longer reads the shared source', () => {
    let aRenders = 0;
    let shared!: State<number>;
    let toggle!: State<boolean>;

    // Child reads the shared source only while its own `reading` flag is true.
    const ChildA = (props: { count: () => number; reading: () => boolean }) => {
      aRenders += 1;
      return (
        <span data-testid="a">
          {props.reading() ? props.count() : 'detached'}
        </span>
      );
    };

    const Parent = () => {
      shared = state(0);
      toggle = state(true);
      return (
        <div>
          <ChildA count={shared} reading={toggle} />
        </div>
      );
    };

    createIsland({ root: container, component: Parent });
    flushScheduler();
    expect(container.querySelector('[data-testid="a"]')?.textContent).toBe('0');

    // Flip the child to stop reading the shared source. `toggle` is read by the
    // parent owner of `toggle`... but here it is passed to the child too, so the
    // child re-renders and, on that render, no longer reads `shared`.
    toggle.set(false);
    flushScheduler();
    expect(container.querySelector('[data-testid="a"]')?.textContent).toBe(
      'detached'
    );
    const aAfterDetach = aRenders;

    // The child is no longer a reader of `shared`; setting it must not re-render.
    shared.set(99);
    flushScheduler();
    expect(aRenders).toBe(aAfterDetach);
    expect(container.querySelector('[data-testid="a"]')?.textContent).toBe(
      'detached'
    );
  });

  it('should not double-notify when a component reads the same source twice in one render', () => {
    let aRenders = 0;
    let shared!: State<number>;

    const ChildA = (props: { count: () => number }) => {
      aRenders += 1;
      // Two reads of the same source in a single render.
      return (
        <span data-testid="a">
          {props.count()}:{props.count()}
        </span>
      );
    };

    const Parent = () => {
      shared = state(0);
      return (
        <div>
          <ChildA count={shared} />
        </div>
      );
    };

    createIsland({ root: container, component: Parent });
    flushScheduler();
    expect(container.querySelector('[data-testid="a"]')?.textContent).toBe(
      '0:0'
    );
    const a0 = aRenders;

    shared.set(7);
    flushScheduler();

    expect(container.querySelector('[data-testid="a"]')?.textContent).toBe(
      '7:7'
    );
    // Exactly one re-render despite two reads of the source.
    expect(aRenders).toBe(a0 + 1);
  });

  it('should notify all readers of a shared derive() when upstream changes, and neither when the derived value is unchanged', () => {
    let aRenders = 0;
    let bRenders = 0;
    let count!: State<number>;

    const ChildA = (props: { positive: () => boolean }) => {
      aRenders += 1;
      return <span data-testid="a">{props.positive() ? 'yes' : 'no'}</span>;
    };
    const ChildB = (props: { positive: () => boolean }) => {
      bRenders += 1;
      return <span data-testid="b">{props.positive() ? 'Y' : 'N'}</span>;
    };

    const Parent = () => {
      count = state(0);
      const positive: Derived<boolean> = derive(() => count() > 0);
      return (
        <div>
          <ChildA positive={positive} />
          <ChildB positive={positive} />
        </div>
      );
    };

    createIsland({ root: container, component: Parent });
    flushScheduler();
    expect(container.querySelector('[data-testid="a"]')?.textContent).toBe(
      'no'
    );
    expect(container.querySelector('[data-testid="b"]')?.textContent).toBe('N');

    // 0 -> 1 flips the derived false -> true: both subscribers re-render once.
    let a0 = aRenders;
    let b0 = bRenders;
    count.set(1);
    flushScheduler();
    expect(container.querySelector('[data-testid="a"]')?.textContent).toBe(
      'yes'
    );
    expect(container.querySelector('[data-testid="b"]')?.textContent).toBe('Y');
    expect(aRenders).toBe(a0 + 1);
    expect(bRenders).toBe(b0 + 1);

    // 1 -> 2 keeps derived `true`: neither subscriber re-renders (memoization).
    a0 = aRenders;
    b0 = bRenders;
    count.set(2);
    flushScheduler();
    expect(aRenders).toBe(a0);
    expect(bRenders).toBe(b0);
  });
});
