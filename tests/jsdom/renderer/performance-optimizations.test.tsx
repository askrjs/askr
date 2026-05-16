// tests/renderer/performance-optimizations.test.tsx
import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src/index';
import { createIsland } from '@askrjs/askr/boot';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('performance optimizations (RENDERER)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  describe('handler wrapper caching', () => {
    it('should reuse wrapper for stable handler reference', () => {
      let renderCount = 0;
      let clickCount = 0;
      const stableHandler = () => clickCount++;

      const Component = () => {
        renderCount++;
        return (
          <button id="btn" onClick={stableHandler}>
            Click
          </button>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();
      expect(renderCount).toBe(1);

      const btn = container.querySelector('#btn') as HTMLButtonElement;
      btn.click();
      flushScheduler();
      expect(clickCount).toBe(1);

      // Force re-render by updating some state
      const Component2 = () => {
        const count = state(0);
        renderCount++;
        return (
          <div>
            <button id="btn" onClick={stableHandler}>
              Click
            </button>
            <button id="trigger" onClick={() => count.set(count() + 1)}>
              Trigger {count()}
            </button>
          </div>
        );
      };

      createIsland({ root: container, component: Component2 });
      flushScheduler();

      // Click trigger to force re-render
      const trigger = container.querySelector('#trigger') as HTMLButtonElement;
      trigger.click();
      flushScheduler();

      // Handler should still work (wrapper was reused)
      const btn2 = container.querySelector('#btn') as HTMLButtonElement;
      btn2.click();
      flushScheduler();
      expect(clickCount).toBe(2);
    });

    it('should create new wrapper for changed handler reference', () => {
      let clickCount = 0;

      const Component = () => {
        const count = state(0);
        return (
          <button
            id="btn"
            onClick={() => {
              clickCount++;
              count.set(count() + 1);
            }}
          >
            Click {count()}
          </button>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      const btn = container.querySelector('#btn') as HTMLButtonElement;

      btn.click();
      flushScheduler();
      expect(clickCount).toBe(1);
      expect(btn.textContent).toBe('Click 1');

      btn.click();
      flushScheduler();
      expect(clickCount).toBe(2);
      expect(btn.textContent).toBe('Click 2');
    });

    it('should handle many unique handlers efficiently', () => {
      const handlers: Array<() => void> = [];
      for (let i = 0; i < 100; i++) {
        handlers.push(() => undefined);
      }

      const Component = () => {
        return (
          <div>
            {handlers.map((handler, idx) => (
              <button key={idx} id={`btn-${idx}`} onClick={handler}>
                Button {idx}
              </button>
            ))}
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      // All buttons should be rendered
      expect(container.querySelectorAll('button').length).toBe(100);

      // Click a few buttons to ensure handlers work
      const btn0 = container.querySelector('#btn-0') as HTMLButtonElement;
      const btn50 = container.querySelector('#btn-50') as HTMLButtonElement;
      const btn99 = container.querySelector('#btn-99') as HTMLButtonElement;

      expect(() => {
        btn0.click();
        btn50.click();
        btn99.click();
      }).not.toThrow();
    });
  });

  describe('ref composition optimization', () => {
    it('should handle extensible objects without throwing', () => {
      const refObject = { current: null };

      const Component = () => {
        return <div ref={refObject}>Content</div>;
      };

      expect(() => {
        createIsland({ root: container, component: Component });
        flushScheduler();
      }).not.toThrow();

      expect(refObject.current).toBe(container.firstElementChild);
    });

    it('should handle sealed objects gracefully', () => {
      const refObject = Object.seal({ current: null });

      const Component = () => {
        return <div ref={refObject}>Content</div>;
      };

      expect(() => {
        createIsland({ root: container, component: Component });
        flushScheduler();
      }).not.toThrow();

      // Should not set current on sealed object (silently skip)
      expect(refObject.current).toBe(null);
    });

    it('should handle frozen objects gracefully', () => {
      const refObject = Object.freeze({ current: null });

      const Component = () => {
        return <div ref={refObject}>Content</div>;
      };

      expect(() => {
        createIsland({ root: container, component: Component });
        flushScheduler();
      }).not.toThrow();

      // Should not set current on frozen object (silently skip)
      expect(refObject.current).toBe(null);
    });

    it('should handle function refs', () => {
      let capturedElement: Element | null = null;

      const Component = () => {
        return <div ref={(el: Element) => (capturedElement = el)}>Content</div>;
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      expect(capturedElement).toBe(container.firstElementChild);
    });
  });

  describe('reactive prop caching', () => {
    it('should re-setup reactive prop for changed function reference', () => {
      let evalCount1 = 0;
      let evalCount2 = 0;

      const Component = () => {
        const count = state(0);
        const getter =
          count() === 0
            ? () => {
                evalCount1++;
                return 'value1';
              }
            : () => {
                evalCount2++;
                return 'value2';
              };

        return (
          <div>
            <input id="input" value={getter} />
            <button id="trigger" onClick={() => count.set(count() + 1)}>
              Trigger
            </button>
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      const input = container.querySelector('#input') as HTMLInputElement;
      expect(input.value).toBe('value1');
      expect(evalCount1).toBeGreaterThan(0);
      expect(evalCount2).toBe(0);

      // Change getter function
      const trigger = container.querySelector('#trigger') as HTMLButtonElement;
      trigger.click();
      flushScheduler();

      expect(input.value).toBe('value2');
      expect(evalCount2).toBeGreaterThan(0);
    });
  });

  describe('text node optimization', () => {
    it('should update text node in place when possible', () => {
      const Component = () => {
        const count = state(0);
        return (
          <div>
            <span id="text">{count()}</span>
            <button id="inc" onClick={() => count.set(count() + 1)}>
              Inc
            </button>
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      const span = container.querySelector('#text') as HTMLSpanElement;
      const textNode = span.firstChild as Text;
      expect(textNode.nodeType).toBe(3); // Text node
      expect(textNode.data).toBe('0');

      // Update text
      const btn = container.querySelector('#inc') as HTMLButtonElement;
      btn.click();
      flushScheduler();

      // Should be same text node (updated in place)
      expect(span.firstChild).toBe(textNode);
      expect(textNode.data).toBe('1');
    });
  });
});
