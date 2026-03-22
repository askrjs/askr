import { describe, it, expect, afterEach } from 'vitest';
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

function getCheckboxHTML(container: HTMLElement): string {
  return container.innerHTML;
}

describe('Checkbox — Determinism', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) {
      unmount(container);
    }
  });

  describe('Render Determinism', () => {
    it('should produce identical output given identical props (native)', () => {
      const props = { checked: true, disabled: false };

      container = mount(<Checkbox {...props} />);
      const output1 = getCheckboxHTML(container);
      unmount(container);

      container = mount(<Checkbox {...props} />);
      const output2 = getCheckboxHTML(container);

      expect(output1).toBe(output2);
    });

    it('should produce identical output given identical props (asChild)', () => {
      const props = {
        asChild: true as const,
        checked: true,
        children: <div>Checkbox</div>,
      };

      container = mount(<Checkbox {...props} />);
      const output1 = getCheckboxHTML(container);
      unmount(container);

      container = mount(<Checkbox {...props} />);
      const output2 = getCheckboxHTML(container);

      expect(output1).toBe(output2);
    });

    it('should produce identical output given indeterminate state', () => {
      const props = { checked: true, indeterminate: true };

      container = mount(<Checkbox {...props} />);
      const output1 = getCheckboxHTML(container);
      unmount(container);

      container = mount(<Checkbox {...props} />);
      const output2 = getCheckboxHTML(container);

      const input1 = container.querySelector('input') as HTMLInputElement;
      expect(input1.getAttribute('aria-checked')).toBeNull();
      expect(output1).toBe(output2);
    });
  });

  describe('Prop Ordering Independence', () => {
    it('should produce identical output given props in different order', () => {
      container = mount(
        <Checkbox checked={true} disabled={false} name="test" />
      );
      const output1 = getCheckboxHTML(container);
      unmount(container);

      container = mount(
        <Checkbox name="test" disabled={false} checked={true} />
      );
      const output2 = getCheckboxHTML(container);

      expect(output1).toBe(output2);
    });
  });

  describe('State Transition Determinism', () => {
    it('should consistently reflect checked state changes', () => {
      container = mount(<Checkbox checked={false} />);
      let input = container.querySelector('input');
      expect(input?.getAttribute('aria-checked')).toBe('false');
      unmount(container);

      container = mount(<Checkbox checked={true} />);
      input = container.querySelector('input');
      expect(input?.getAttribute('aria-checked')).toBe('true');
      unmount(container);

      container = mount(<Checkbox checked={false} />);
      input = container.querySelector('input');
      expect(input?.getAttribute('aria-checked')).toBe('false');
    });

    it('should consistently reflect indeterminate state changes', () => {
      container = mount(<Checkbox indeterminate={false} />);
      let input = container.querySelector('input');
      expect(input?.getAttribute('aria-checked')).toBe('false');
      unmount(container);

      container = mount(<Checkbox indeterminate={true} />);
      input = container.querySelector('input') as HTMLInputElement;
      expect(input.getAttribute('aria-checked')).toBeNull();
      unmount(container);

      container = mount(<Checkbox indeterminate={false} checked={true} />);
      input = container.querySelector('input');
      expect(input?.getAttribute('aria-checked')).toBe('true');
    });
  });

  describe('Ref Consistency', () => {
    it('should provide same element reference given multiple calls', () => {
      const refs: Array<HTMLInputElement | null> = [];
      const refCallback = (node: HTMLInputElement | null) => {
        refs.push(node);
      };

      container = mount(<Checkbox ref={refCallback} />);
      const input = container.querySelector('input') as HTMLInputElement;

      expect(input).toBeTruthy();
      expect(refs.filter(Boolean)).toHaveLength(1);
      expect(refs[0]).toBe(input);
    });
  });

  describe('Children Stability', () => {
    it('should render stable children content given static children', () => {
      container = mount(<Checkbox>Label Text</Checkbox>);
      const output1 = getCheckboxHTML(container);
      unmount(container);

      container = mount(<Checkbox>Label Text</Checkbox>);
      const output2 = getCheckboxHTML(container);

      expect(output1).toBe(output2);
    });
  });

  describe('Attribute Presence Determinism', () => {
    it('should always include aria-checked attribute', () => {
      // No checked prop
      container = mount(<Checkbox />);
      let input = container.querySelector('input');
      expect(input?.hasAttribute('aria-checked')).toBe(true);
      unmount(container);

      // Explicit checked=false
      container = mount(<Checkbox checked={false} />);
      input = container.querySelector('input');
      expect(input?.hasAttribute('aria-checked')).toBe(true);
      unmount(container);

      // Explicit checked=true
      container = mount(<Checkbox checked={true} />);
      input = container.querySelector('input');
      expect(input?.hasAttribute('aria-checked')).toBe(true);
    });

    it('should conditionally include name and value attributes', () => {
      // Without name/value
      container = mount(<Checkbox />);
      let input = container.querySelector('input');
      expect(input?.hasAttribute('name')).toBe(false);
      expect(input?.hasAttribute('value')).toBe(false);
      unmount(container);

      // With name/value
      container = mount(<Checkbox name="agree" value="yes" />);
      input = container.querySelector('input');
      expect(input?.hasAttribute('name')).toBe(true);
      expect(input?.hasAttribute('value')).toBe(true);
    });
  });
});
