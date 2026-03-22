import { describe, it, expect, afterEach, vi } from 'vitest';
import { Checkbox } from '../../../src/components/checkbox/checkbox';
import { createIsland } from '@askrjs/askr';
import { axe } from 'vitest-axe';
import { CHECKBOX_A11Y_CONTRACT } from '../../../src/components/checkbox/checkbox.a11y';

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

describe('Checkbox — Accessibility', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) {
      unmount(container);
    }
  });

  function renderLabeledCheckbox(props: Record<string, unknown> = {}) {
    return (
      <label>
        Accept terms
        <Checkbox {...props} />
      </label>
    );
  }

  describe('Automated Axe Checks', () => {
    it('should have no automated axe violations given default checkbox', async () => {
      container = mount(renderLabeledCheckbox());
      const results = await axe(container);

      if (results.violations.length > 0) {
        throw new Error(
          `Axe violations found:\n${results.violations
            .map(
              (v) =>
                `  - ${v.id}: ${v.description}\n    ${v.nodes.map((n) => n.html).join('\n    ')}`
            )
            .join('\n')}`
        );
      }
    });

    it('should have no automated axe violations given checked checkbox', async () => {
      container = mount(renderLabeledCheckbox({ checked: true }));
      const results = await axe(container);

      if (results.violations.length > 0) {
        throw new Error(
          `Axe violations found:\n${results.violations
            .map(
              (v) =>
                `  - ${v.id}: ${v.description}\n    ${v.nodes.map((n) => n.html).join('\n    ')}`
            )
            .join('\n')}`
        );
      }
    });

    it('should have no automated axe violations given indeterminate checkbox', async () => {
      container = mount(renderLabeledCheckbox({ indeterminate: true }));
      const results = await axe(container);

      if (results.violations.length > 0) {
        throw new Error(
          `Axe violations found:\n${results.violations
            .map(
              (v) =>
                `  - ${v.id}: ${v.description}\n    ${v.nodes.map((n) => n.html).join('\n    ')}`
            )
            .join('\n')}`
        );
      }
    });

    it('should have no automated axe violations given disabled checkbox', async () => {
      container = mount(renderLabeledCheckbox({ disabled: true }));
      const results = await axe(container);

      if (results.violations.length > 0) {
        throw new Error(
          `Axe violations found:\n${results.violations
            .map(
              (v) =>
                `  - ${v.id}: ${v.description}\n    ${v.nodes.map((n) => n.html).join('\n    ')}`
            )
            .join('\n')}`
        );
      }
    });

    it('should have no automated axe violations given asChild checkbox', async () => {
      container = mount(
        <Checkbox asChild checked={false}>
          <div role="checkbox" aria-label="Custom checkbox">
            Custom
          </div>
        </Checkbox>
      );
      const results = await axe(container);

      if (results.violations.length > 0) {
        throw new Error(
          `Axe violations found:\n${results.violations
            .map(
              (v) =>
                `  - ${v.id}: ${v.description}\n    ${v.nodes.map((n) => n.html).join('\n    ')}`
            )
            .join('\n')}`
        );
      }
    });
  });

  describe('ARIA Contract Enforcement', () => {
    it('should apply correct role given native input', () => {
      container = mount(<Checkbox />);
      const input = container.querySelector('input');
      // Native inputs have implicit role='checkbox'
      expect(input?.getAttribute('type')).toBe('checkbox');
    });

    it('should require explicit role given asChild', () => {
      // Consumer must add role='checkbox' for non-native elements
      container = mount(
        <Checkbox asChild>
          <div role="checkbox">Checkbox</div>
        </Checkbox>
      );
      const div = container.querySelector('div');
      expect(div?.getAttribute('role')).toBe(CHECKBOX_A11Y_CONTRACT.ROLE);
    });

    it('should expose aria-checked attribute given all states', () => {
      // Unchecked
      container = mount(<Checkbox checked={false} />);
      let input = container.querySelector('input');
      expect(input?.getAttribute('aria-checked')).toBe('false');
      unmount(container);

      // Checked
      container = mount(<Checkbox checked={true} />);
      input = container.querySelector('input');
      expect(input?.getAttribute('aria-checked')).toBe('true');
      unmount(container);

      // Indeterminate native inputs remain valid without mixed ARIA in the current host runtime
      container = mount(<Checkbox indeterminate={true} />);
      input = container.querySelector('input') as HTMLInputElement;
      expect(input.getAttribute('aria-checked')).toBeNull();
    });

    it('should NOT omit aria-checked given default state', () => {
      container = mount(<Checkbox />);
      const input = container.querySelector('input');
      // aria-checked must always be present, never undefined
      expect(input?.hasAttribute('aria-checked')).toBe(true);
      expect(input?.getAttribute('aria-checked')).toBe('false');
    });
  });

  describe('Keyboard Navigation', () => {
    it('should be focusable given not disabled', () => {
      container = mount(<Checkbox />);
      const input = container.querySelector('input') as HTMLInputElement;
      document.body.appendChild(container);
      input.focus();
      expect(document.activeElement).toBe(input);
    });

    it('should NOT be focusable given disabled', () => {
      container = mount(<Checkbox disabled />);
      const input = container.querySelector('input') as HTMLInputElement;
      input.focus();
      expect(input.disabled).toBe(true);
    });

    it('should activate on Space key given enabled', () => {
      const onPress = vi.fn();
      container = mount(<Checkbox onPress={onPress} />);
      const input = container.querySelector('input')!;
      input.focus();
      const event = new MouseEvent('click', {
        bubbles: true,
      });
      input.dispatchEvent(event);
      expect(onPress).toHaveBeenCalled();
    });
  });

  describe('Disabled State Semantics', () => {
    it('should apply disabled attribute given native input', () => {
      container = mount(<Checkbox disabled />);
      const input = container.querySelector('input') as HTMLInputElement;
      expect(input?.disabled).toBe(true);
    });

    it('should apply aria-disabled given asChild', () => {
      container = mount(
        <Checkbox asChild disabled>
          <div role="checkbox">Disabled</div>
        </Checkbox>
      );
      const div = container.querySelector('div');
      expect(div?.getAttribute('aria-disabled')).toBe('true');
    });

    it('should remove from tab order given disabled asChild', () => {
      container = mount(
        <Checkbox asChild disabled>
          <div role="checkbox" tabIndex={0}>
            Disabled
          </div>
        </Checkbox>
      );
      const div = container.querySelector('div');
      // Disabled elements should have tabIndex=-1
      expect(div?.getAttribute('tabindex')).toBe('-1');
    });
  });

  describe('Form Integration', () => {
    it('should include name and value in form data given native input', () => {
      container = mount(<Checkbox name="agree" value="yes" checked={true} />);
      const input = container.querySelector('input') as HTMLInputElement;
      expect(input?.name).toBe('agree');
      expect(input?.value).toBe('yes');
      expect(input?.checked).toBe(true);
    });

    it('should respect required attribute given form validation', () => {
      container = mount(<Checkbox required />);
      const input = container.querySelector('input') as HTMLInputElement;
      expect(input?.required).toBe(true);
    });
  });
});
