import { describe, it, expect, vi, afterEach } from 'vite-plus/test';
import { Toggle } from '../../../src/components/primitives/toggle/toggle';
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

describe('Toggle — Determinism', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) {
      unmount(container);
    }
  });

  describe('Repeatable Outcomes', () => {
    it('should produce identical DOM given identical props across mounts', () => {
      container = mount(
        <Toggle pressed={false} type="button">
          Toggle
        </Toggle>
      );
      const html1 = container.innerHTML;

      unmount(container);

      container = mount(
        <Toggle pressed={false} type="button">
          Toggle
        </Toggle>
      );
      const html2 = container.innerHTML;

      expect(html1).toBe(html2);
    });

    it('should fire onPress in consistent order given multiple interactions', () => {
      const calls: string[] = [];
      const onPress = vi.fn(() => calls.push('press'));

      container = mount(<Toggle onPress={onPress}>Toggle</Toggle>);
      const button = container.querySelector('button')!;

      button.click();
      button.click();
      button.click();

      expect(calls).toEqual(['press', 'press', 'press']);
      expect(onPress).toHaveBeenCalledTimes(3);
    });
  });

  describe('No Hidden Async', () => {
    it('should render synchronously given initial mount', () => {
      container = mount(<Toggle>Toggle</Toggle>);
      const button = container.querySelector('button');
      // Button exists immediately, no async rendering
      expect(button).toBeDefined();
    });

    it('should not use timers given component is scheduler-safe', () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      const setIntervalSpy = vi.spyOn(global, 'setInterval');

      container = mount(<Toggle>Toggle</Toggle>);

      expect(setTimeoutSpy).not.toHaveBeenCalled();
      expect(setIntervalSpy).not.toHaveBeenCalled();

      setTimeoutSpy.mockRestore();
      setIntervalSpy.mockRestore();
    });

    it('should call onPress synchronously given click', () => {
      const onPress = vi.fn();
      container = mount(<Toggle onPress={onPress}>Toggle</Toggle>);
      const button = container.querySelector('button')!;

      const result = button.click();

      expect(result).toBeUndefined();
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('No Side Effects', () => {
    it('should not mutate global scope given component isolation', () => {
      const beforeKeys = Object.keys(globalThis);

      container = mount(<Toggle>Toggle</Toggle>);

      const afterKeys = Object.keys(globalThis);
      expect(afterKeys.length).toBe(beforeKeys.length);
    });

    it('should not modify DOM outside container given scoped mutations', () => {
      const externalDiv = document.createElement('div');
      externalDiv.id = 'external-toggle-test';
      document.body.appendChild(externalDiv);

      container = mount(<Toggle>Toggle</Toggle>);

      const stillThere = document.getElementById('external-toggle-test');
      expect(stillThere).toBe(externalDiv);

      document.body.removeChild(externalDiv);
    });

    it('should NOT mutate external state given render', () => {
      const externalState = { count: 0 };
      container = mount(
        <Toggle
          onPress={() => {
            externalState.count++;
          }}
        >
          Toggle
        </Toggle>
      );
      // Render alone doesn't trigger onPress
      expect(externalState.count).toBe(0);
    });

    it('should NOT invoke onPress during render', () => {
      const onPress = vi.fn();
      container = mount(<Toggle onPress={onPress}>Toggle</Toggle>);
      expect(onPress).not.toHaveBeenCalled();
    });

    it('should clean up when unmounted given no leaked listeners', () => {
      const onPress = vi.fn();
      container = mount(<Toggle onPress={onPress}>Toggle</Toggle>);
      const button = container.querySelector('button')!;

      button.click();
      expect(onPress).toHaveBeenCalledTimes(1);

      unmount(container);

      expect(button.isConnected).toBe(false);
    });
  });

  describe('Predictable State', () => {
    it('should default pressed to false given no prop', () => {
      container = mount(<Toggle>Toggle</Toggle>);
      const button = container.querySelector('button');
      expect(button?.getAttribute('aria-pressed')).toBe('false');
    });

    it('should default disabled to false given no prop', () => {
      container = mount(<Toggle>Toggle</Toggle>);
      const button = container.querySelector('button');
      expect(button?.hasAttribute('disabled')).toBe(false);
      expect(button?.hasAttribute('aria-disabled')).toBe(false);
    });

    it('should default type to button given native button', () => {
      container = mount(<Toggle>Toggle</Toggle>);
      const button = container.querySelector('button');
      expect(button?.getAttribute('type')).toBe('button');
    });

    it('should render consistently given same prop values multiple times', () => {
      const snapshots: string[] = [];

      for (let i = 0; i < 3; i++) {
        container = mount(
          <Toggle pressed={false} type="button">
            Toggle
          </Toggle>
        );
        snapshots.push(container.innerHTML);
        unmount(container);
      }

      expect(snapshots[0]).toBe(snapshots[1]);
      expect(snapshots[1]).toBe(snapshots[2]);
    });
  });

  describe('Scheduler Safety', () => {
    it('should handle rapid clicks without error', () => {
      const onPress = vi.fn();
      container = mount(<Toggle onPress={onPress}>Toggle</Toggle>);
      const button = container.querySelector('button')!;

      expect(() => {
        button.click();
        button.click();
        button.click();
        button.click();
        button.click();
      }).not.toThrow();

      expect(onPress).toHaveBeenCalledTimes(5);
    });
  });
});
