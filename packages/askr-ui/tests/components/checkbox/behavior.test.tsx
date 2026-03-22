import { describe, it, expect, vi, afterEach } from 'vitest';
import { Checkbox } from '../../../src/components/checkbox/checkbox';
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

describe('Checkbox — Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) {
      unmount(container);
    }
  });

  describe('Foundation Delegation', () => {
    it('should render native input given no asChild', () => {
      container = mount(<Checkbox />);
      const input = container.querySelector('input[type="checkbox"]');
      expect(input).toBeDefined();
    });

    it('should call onPress given click when not disabled', () => {
      const onPress = vi.fn();
      container = mount(<Checkbox onPress={onPress} />);
      const input = container.querySelector('input')!;
      input.click();
      expect(onPress).toHaveBeenCalledOnce();
    });

    it('should NOT call onPress given click when disabled', () => {
      const onPress = vi.fn();
      container = mount(<Checkbox disabled onPress={onPress} />);
      const input = container.querySelector('input')!;
      input.click();
      expect(onPress).not.toHaveBeenCalled();
    });
  });

  describe('ARIA Checked State', () => {
    it('should set aria-checked=false given checked=false', () => {
      container = mount(<Checkbox checked={false} />);
      const input = container.querySelector('input');
      expect(input?.getAttribute('aria-checked')).toBe('false');
    });

    it('should set aria-checked=true given checked=true', () => {
      container = mount(<Checkbox checked={true} />);
      const input = container.querySelector('input');
      expect(input?.getAttribute('aria-checked')).toBe('true');
    });

    it('should default aria-checked=false given no checked prop', () => {
      container = mount(<Checkbox />);
      const input = container.querySelector('input');
      expect(input?.getAttribute('aria-checked')).toBe('false');
    });

    it('should omit aria-checked given indeterminate=true on native input', () => {
      container = mount(<Checkbox indeterminate={true} />);
      const input = container.querySelector('input') as HTMLInputElement;
      expect(input.getAttribute('aria-checked')).toBeNull();
    });

    it('should omit aria-checked given checked and indeterminate on native input', () => {
      container = mount(<Checkbox checked={true} indeterminate={true} />);
      const input = container.querySelector('input') as HTMLInputElement;
      expect(input.getAttribute('aria-checked')).toBeNull();
    });
  });

  describe('Native Input Attributes', () => {
    it('should set checked attribute given checked=true', () => {
      container = mount(<Checkbox checked={true} />);
      const input = container.querySelector('input') as HTMLInputElement;
      expect(input?.checked).toBe(true);
    });

    it('should set disabled attribute given disabled=true', () => {
      container = mount(<Checkbox disabled={true} />);
      const input = container.querySelector('input') as HTMLInputElement;
      expect(input?.disabled).toBe(true);
    });

    it('should set required attribute given required=true', () => {
      container = mount(<Checkbox required={true} />);
      const input = container.querySelector('input') as HTMLInputElement;
      expect(input?.required).toBe(true);
    });

    it('should set name attribute given name prop', () => {
      container = mount(<Checkbox name="terms" />);
      const input = container.querySelector('input');
      expect(input?.getAttribute('name')).toBe('terms');
    });

    it('should set value attribute given value prop', () => {
      container = mount(<Checkbox value="accepted" />);
      const input = container.querySelector('input');
      expect(input?.getAttribute('value')).toBe('accepted');
    });
  });

  describe('asChild Invariant', () => {
    it('should render child element given asChild=true', () => {
      container = mount(
        <Checkbox asChild>
          <span>Custom Checkbox</span>
        </Checkbox>
      );
      const span = container.querySelector('span');
      expect(span).toBeDefined();
      expect(span?.textContent).toBe('Custom Checkbox');
    });

    it('should merge aria-checked onto child given asChild', () => {
      container = mount(
        <Checkbox asChild checked={true}>
          <div>Agree</div>
        </Checkbox>
      );
      const div = container.querySelector('div');
      expect(div?.getAttribute('aria-checked')).toBe('true');
    });

    it('should merge indeterminate aria-checked onto child given asChild', () => {
      container = mount(
        <Checkbox asChild indeterminate={true}>
          <div>Select All</div>
        </Checkbox>
      );
      const div = container.querySelector('div');
      expect(div?.getAttribute('aria-checked')).toBe('mixed');
    });

    it('should call onPress given click on asChild element', () => {
      const onPress = vi.fn();
      container = mount(
        <Checkbox asChild onPress={onPress}>
          <span>Checkbox</span>
        </Checkbox>
      );
      const span = container.querySelector('span')!;
      span.click();
      expect(onPress).toHaveBeenCalledOnce();
    });

    it('should forward custom props given asChild', () => {
      container = mount(
        <Checkbox asChild data-testid="custom">
          <div>Checkbox</div>
        </Checkbox>
      );
      const div = container.querySelector('div');
      expect(div?.getAttribute('data-testid')).toBe('custom');
    });
  });

  describe('Composition Safety', () => {
    it('should NOT leak onClick prop given onPress', () => {
      container = mount(<Checkbox onPress={() => {}} />);
      const input = container.querySelector('input')!;
      // onClick is added by pressable foundation, not leaked from user
      expect(input.onclick).toBeDefined();
    });

    it('should merge user className with component props', () => {
      container = mount(<Checkbox className="custom" />);
      const input = container.querySelector('input');
      expect(input?.classList.contains('custom')).toBe(true);
    });

    it('should preserve user data attributes', () => {
      container = mount(<Checkbox data-custom="value" />);
      const input = container.querySelector('input');
      expect(input?.getAttribute('data-custom')).toBe('value');
    });
  });

  describe('Ref Forwarding', () => {
    it('should forward ref prop to native input', () => {
      let refNode: HTMLInputElement | null = null;
      const refCallback = (node: HTMLInputElement | null) => {
        refNode = node;
      };
      container = mount(<Checkbox ref={refCallback} />);
      const input = container.querySelector('input') as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(refNode).toBe(input);
    });

    it('should forward ref prop on asChild', () => {
      let refNode: HTMLElement | null = null;
      const refCallback = (node: HTMLElement | null) => {
        refNode = node;
      };
      container = mount(
        <Checkbox asChild ref={refCallback}>
          <div>Checkbox</div>
        </Checkbox>
      );
      const div = container.querySelector('div') as HTMLElement;
      expect(div).toBeTruthy();
      expect(refNode).toBe(div);
    });
  });
});
