import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../src/boot';
import { state } from '../../../src/runtime/state';
import { dismissable } from '../../../src/foundations/interactions/dismissable';
import { parseEventProp, getPassiveOptions } from '../../../src/renderer/utils';

describe('capture event props', () => {
  let container: HTMLDivElement;
  let cleanup: () => void;

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should preserve pointer-capture event names given onGotPointerCapture props', () => {
    expect(parseEventProp('onGotPointerCapture')).toEqual({
      eventName: 'gotpointercapture',
      capture: false,
    });
  });

  it('should allow cancellation given wheel and touch handlers when they call preventDefault', () => {
    expect(getPassiveOptions('wheel')).toBeUndefined();
    expect(getPassiveOptions('touchmove')).toBeUndefined();
  });

  it('should dispatch non-bubbling focus handlers given a focused descendant', () => {
    const events: string[] = [];
    const Component = () => <main onFocus={() => events.push('focus')}><input /></main>;
    createIsland({ root: container, component: Component });
    flushScheduler();
    container.querySelector('input')!.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
    flushScheduler();
    expect(events).toEqual(['focus']);
  });

  it('should dispatch non-bubbling scroll handlers given a scrolled descendant', () => {
    const events: string[] = [];
    const Component = () => (
      <main onScroll={() => events.push('outer')}>
        <div onScroll={() => events.push('inner')} />
      </main>
    );
    createIsland({ root: container, component: Component });
    flushScheduler();
    const inner = container.querySelector('div div') ?? container.querySelector('main > div');
    inner!.dispatchEvent(new Event('scroll', { bubbles: false }));
    flushScheduler();
    expect(events).toEqual(['outer', 'inner']);
  });

  it('should preserve capture and bubble listeners for the same DOM event', () => {
    const events: string[] = [];

    const Component = () => (
      <div
        id="outer"
        onPointerDownCapture={() => events.push('outer-capture')}
        onPointerDown={() => events.push('outer-bubble')}
      >
        <button id="inner" onPointerDown={() => events.push('inner-bubble')}>
          Press
        </button>
      </div>
    );

    createIsland({ root: container, component: Component });
    flushScheduler();

    const inner = container.querySelector('#inner') as HTMLButtonElement;
    inner.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    flushScheduler();

    expect(events).toEqual(['outer-capture', 'inner-bubble', 'outer-bubble']);
  });

  it('should allow dismissable to observe outside pointerdown via onPointerDownCapture', async () => {
    const dismisses: Array<'escape' | 'outside'> = [];
    let panelNode: HTMLDivElement | null = null;
    let bindDismissable!: ReturnType<typeof state<boolean>>;

    const Component = () => {
      bindDismissable = state(false);
      const captureReady = bindDismissable();

      return (
        <div
          id="surface"
          {...(captureReady
            ? dismissable({
                node: panelNode,
                onDismiss: (trigger) => dismisses.push(trigger),
              })
            : {})}
        >
          <button id="outside">Outside</button>
          <div
            id="panel"
            ref={(element) => {
              panelNode = element as HTMLDivElement | null;
              if (!captureReady) {
                queueMicrotask(() => {
                  bindDismissable.set(true);
                });
              }
            }}
          >
            Panel
          </div>
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    await Promise.resolve();
    flushScheduler();

    const outside = container.querySelector('#outside') as HTMLButtonElement;
    outside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    flushScheduler();

    expect(dismisses).toEqual(['outside']);

    const panel = container.querySelector('#panel') as HTMLDivElement;
    panel.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    flushScheduler();

    expect(dismisses).toEqual(['outside']);
  });
});
