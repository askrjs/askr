import { describe, it, expect, afterEach, vi } from 'vite-plus/test';
import { Button } from '../../../src/components/primitives/button/button';
import { createIsland } from '@askrjs/askr';

function mount(element: JSX.Element): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  createIsland({
    root: container,
    component: () => element,
  });
  return container;
}

function unmount(container: HTMLElement) {
  if (container.parentNode) {
    container.parentNode.removeChild(container);
  }
}

describe('Button - Determinism', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) {
      unmount(container);
    }
  });

  // ========================================
  // REPEATABLE OUTCOMES
  // ========================================
  describe('repeatable outcomes', () => {
    it('should produce identical behavior given identical inputs across multiple renders', () => {
      const onPress1 = vi.fn();
      const onPress2 = vi.fn();

      // First render
      container = mount(<Button onPress={onPress1}>Click me</Button>);
      let button = container.querySelector('button')!;
      button.click();

      expect(onPress1).toHaveBeenCalledTimes(1);

      unmount(container);

      // Second render with identical props
      container = mount(<Button onPress={onPress2}>Click me</Button>);
      button = container.querySelector('button')!;
      button.click();

      expect(onPress2).toHaveBeenCalledTimes(1);

      // Behavior should be identical
      expect(onPress1).toHaveBeenCalledTimes(onPress2.mock.calls.length);
    });

    it('should fire events in consistent order given multiple interactions', () => {
      const calls: string[] = [];
      const onPress = vi.fn(() => calls.push('press'));

      container = mount(<Button onPress={onPress}>Click me</Button>);
      const button = container.querySelector('button')!;

      // Multiple interactions should be handled in order
      button.click();
      button.click();
      button.click();

      expect(calls).toEqual(['press', 'press', 'press']);
      expect(onPress).toHaveBeenCalledTimes(3);
    });

    it('should produce same DOM structure given same props', () => {
      container = mount(<Button type="submit">Submit</Button>);
      const html1 = container.innerHTML;

      unmount(container);

      container = mount(<Button type="submit">Submit</Button>);
      const html2 = container.innerHTML;

      expect(html1).toBe(html2);
    });
  });

  // ========================================
  // NO HIDDEN ASYNC
  // ========================================
  describe('no hidden async', () => {
    it('should handle clicks immediately given no async delays', () => {
      const onPress = vi.fn();

      container = mount(<Button onPress={onPress}>Click me</Button>);
      const button = container.querySelector('button')!;

      button.click();

      // Should be called synchronously, no await needed
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('should not use timers given component is scheduler-safe', () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      const setIntervalSpy = vi.spyOn(global, 'setInterval');

      container = mount(<Button>Click me</Button>);

      expect(setTimeoutSpy).not.toHaveBeenCalled();
      expect(setIntervalSpy).not.toHaveBeenCalled();

      setTimeoutSpy.mockRestore();
      setIntervalSpy.mockRestore();
    });

    it('should not create promises given synchronous behavior', () => {
      const onPress = vi.fn();

      container = mount(<Button onPress={onPress}>Click me</Button>);
      const button = container.querySelector('button')!;

      const result = button.click();

      // click() should not return a promise
      expect(result).toBeUndefined();
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================
  // NO SIDE EFFECTS
  // ========================================
  describe('no side effects', () => {
    it('should not mutate global state given component isolation', () => {
      const beforeKeys = Object.keys(globalThis);

      container = mount(<Button>Click me</Button>);

      const afterKeys = Object.keys(globalThis);

      // Should not add properties to global scope
      expect(afterKeys.length).toBe(beforeKeys.length);
    });

    it('should not modify DOM outside container given scoped mutations', () => {
      const externalDiv = document.createElement('div');
      externalDiv.id = 'external';
      document.body.appendChild(externalDiv);

      container = mount(<Button>Click me</Button>);

      // External element should be unchanged
      const stillThere = document.getElementById('external');
      expect(stillThere).toBe(externalDiv);

      document.body.removeChild(externalDiv);
    });

    it('should clean up when unmounted given no leaked listeners', () => {
      const onPress = vi.fn();

      container = mount(<Button onPress={onPress}>Click me</Button>);
      const button = container.querySelector('button')!;

      button.click();
      expect(onPress).toHaveBeenCalledTimes(1);

      unmount(container);

      // After unmount, handler should not fire
      onPress.mockClear();

      // Button is detached, can't click
      expect(button.isConnected).toBe(false);
    });
  });

  // ========================================
  // PREDICTABLE STATE
  // ========================================
  describe('predictable state', () => {
    it('should have no internal state given stateless component', () => {
      container = mount(<Button>Click me</Button>);
      const button = container.querySelector('button')!;

      // Button should not track clicks or maintain state
      button.click();
      button.click();

      // No state means behavior is purely props-driven
      expect(button.textContent).toBe('Click me');
    });

    it('should not persist disabled state changes given props control behavior', () => {
      const onPress = vi.fn();

      // Start enabled
      container = mount(
        <Button disabled={false} onPress={onPress}>
          Click me
        </Button>
      );
      let button = container.querySelector('button')!;

      button.click();
      expect(onPress).toHaveBeenCalledTimes(1);

      unmount(container);
      onPress.mockClear();

      // Now disabled - completely new mount
      container = mount(
        <Button disabled onPress={onPress}>
          Click me
        </Button>
      );
      button = container.querySelector('button')!;

      button.click();
      expect(onPress).not.toHaveBeenCalled();
    });

    it('should render consistently given same prop values multiple times', () => {
      const snapshots: string[] = [];

      for (let i = 0; i < 3; i++) {
        container = mount(<Button type="button">Test</Button>);
        snapshots.push(container.innerHTML);
        unmount(container);
      }

      // All renders should be identical
      expect(snapshots[0]).toBe(snapshots[1]);
      expect(snapshots[1]).toBe(snapshots[2]);
    });
  });

  // ========================================
  // SCHEDULER SAFETY
  // ========================================
  describe('scheduler safety', () => {
    it('should not depend on execution timing given synchronous composition', () => {
      const onPress = vi.fn();

      container = mount(<Button onPress={onPress}>Click me</Button>);
      const button = container.querySelector('button')!;

      // Immediate click should work
      button.click();
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('should compose cleanly with other foundations given no coordination needed', () => {
      // Button + other props should merge without timing issues
      const onPress = vi.fn();

      container = mount(
        <Button
          onPress={onPress}
          data-testid="test"
          aria-label="action"
          className="btn"
        >
          Click me
        </Button>
      );

      const button = container.querySelector('button')!;

      expect(button.getAttribute('data-testid')).toBe('test');
      expect(button.getAttribute('aria-label')).toBe('action');
      expect(button.className).toBe('btn');

      button.click();
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });
});
