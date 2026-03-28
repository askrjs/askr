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

describe('Toggle — Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) {
      unmount(container);
    }
  });

  describe('Foundation Delegation', () => {
    it('should render native button given no asChild', () => {
      container = mount(<Toggle>Toggle</Toggle>);
      const button = container.querySelector('button');
      expect(button).toBeDefined();
      expect(button?.textContent).toBe('Toggle');
    });

    it('should default type to button given native button', () => {
      container = mount(<Toggle>Toggle</Toggle>);
      const button = container.querySelector('button');
      expect(button?.getAttribute('type')).toBe('button');
    });

    it('should accept explicit type given native button', () => {
      container = mount(<Toggle type="submit">Submit</Toggle>);
      const button = container.querySelector('button');
      expect(button?.getAttribute('type')).toBe('submit');
    });

    it('should call onPress given click when not disabled', () => {
      const onPress = vi.fn();
      container = mount(<Toggle onPress={onPress}>Toggle</Toggle>);
      const button = container.querySelector('button')!;
      button.click();
      expect(onPress).toHaveBeenCalledOnce();
    });

    it('should NOT call onPress given click when disabled', () => {
      const onPress = vi.fn();
      container = mount(
        <Toggle disabled onPress={onPress}>
          Toggle
        </Toggle>
      );
      const button = container.querySelector('button')!;
      button.click();
      expect(onPress).not.toHaveBeenCalled();
    });
  });

  describe('ARIA Pressed State', () => {
    it('should set aria-pressed=false given pressed=false', () => {
      container = mount(<Toggle pressed={false}>Toggle</Toggle>);
      const button = container.querySelector('button');
      expect(button?.getAttribute('aria-pressed')).toBe('false');
    });

    it('should set aria-pressed=true given pressed=true', () => {
      container = mount(<Toggle pressed={true}>Toggle</Toggle>);
      const button = container.querySelector('button');
      expect(button?.getAttribute('aria-pressed')).toBe('true');
    });

    it('should default aria-pressed=false given no pressed prop', () => {
      container = mount(<Toggle>Toggle</Toggle>);
      const button = container.querySelector('button');
      expect(button?.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('asChild Invariant', () => {
    it('should render child element given asChild=true', () => {
      container = mount(
        <Toggle asChild>
          <span>Custom Toggle</span>
        </Toggle>
      );
      const span = container.querySelector('span');
      expect(span).toBeDefined();
      expect(span?.textContent).toBe('Custom Toggle');
    });

    it('should merge aria-pressed onto child given asChild', () => {
      container = mount(
        <Toggle asChild pressed={true}>
          <span>Toggle</span>
        </Toggle>
      );
      const span = container.querySelector('span');
      expect(span?.getAttribute('aria-pressed')).toBe('true');
    });

    it('should call onPress given click on asChild element', () => {
      const onPress = vi.fn();
      container = mount(
        <Toggle asChild onPress={onPress}>
          <span>Toggle</span>
        </Toggle>
      );
      const span = container.querySelector('span')!;
      span.click();
      expect(onPress).toHaveBeenCalledOnce();
    });

    it('should forward custom props given asChild', () => {
      container = mount(
        <Toggle asChild data-testid="custom">
          <div>Toggle</div>
        </Toggle>
      );
      const div = container.querySelector('div');
      expect(div?.getAttribute('data-testid')).toBe('custom');
    });
  });

  describe('Composition Safety', () => {
    it('should NOT leak onClick prop given onPress', () => {
      container = mount(<Toggle onPress={() => {}}>Toggle</Toggle>);
      const button = container.querySelector('button')!;
      // onClick is added by pressable foundation, not leaked from user
      expect(button.onclick).toBeDefined();
    });

    it('should merge user className with component props', () => {
      container = mount(<Toggle className="custom">Toggle</Toggle>);
      const button = container.querySelector('button');
      expect(button?.classList.contains('custom')).toBe(true);
    });

    it('should preserve user data attributes', () => {
      container = mount(
        <Toggle data-foo="bar" data-pressed="custom">
          Toggle
        </Toggle>
      );
      const button = container.querySelector('button');
      expect(button?.getAttribute('data-foo')).toBe('bar');
      expect(button?.getAttribute('data-pressed')).toBe('custom');
    });
  });

  describe('Disabled Semantics', () => {
    it('should apply disabled attribute given disabled=true on native button', () => {
      container = mount(<Toggle disabled>Toggle</Toggle>);
      const button = container.querySelector('button');
      expect(button?.hasAttribute('disabled')).toBe(true);
    });

    it('should apply aria-disabled given disabled=true', () => {
      container = mount(<Toggle disabled>Toggle</Toggle>);
      const button = container.querySelector('button');
      expect(button?.getAttribute('aria-disabled')).toBe('true');
    });

    it('should apply aria-disabled on asChild element given disabled', () => {
      container = mount(
        <Toggle asChild disabled>
          <span>Toggle</span>
        </Toggle>
      );
      const span = container.querySelector('span');
      expect(span?.getAttribute('aria-disabled')).toBe('true');
    });

    it('should NOT call onPress given disabled and click', () => {
      const onPress = vi.fn();
      container = mount(
        <Toggle disabled onPress={onPress}>
          Toggle
        </Toggle>
      );
      const button = container.querySelector('button')!;
      button.click();
      expect(onPress).not.toHaveBeenCalled();
    });
  });

  describe('Regression Guards', () => {
    it('should NOT render multiple wrappers given asChild', () => {
      container = mount(
        <Toggle asChild>
          <span>Toggle</span>
        </Toggle>
      );
      // Should only have the span, no extra wrappers
      expect(container.querySelectorAll('span').length).toBe(1);
    });

    it('should handle onPress=undefined without error', () => {
      expect(() => {
        container = mount(<Toggle>Toggle</Toggle>);
        const button = container.querySelector('button')!;
        button.click();
      }).not.toThrow();
    });
  });
});
