import { describe, it, expect, afterEach } from 'vite-plus/test';
import { Toggle } from '../../../src/components/primitives/toggle/toggle';
import { createIsland } from '@askrjs/askr';
import { axe } from 'vitest-axe';
import { TOGGLE_A11Y_CONTRACT } from '../../../src/components/primitives/toggle/toggle.a11y';

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

describe('Toggle — Accessibility', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) {
      unmount(container);
    }
  });

  describe('Automated Axe Checks', () => {
    it('should have no automated axe violations given default toggle', async () => {
      container = mount(<Toggle>Toggle</Toggle>);
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

    it('should have no automated axe violations given pressed toggle', async () => {
      container = mount(<Toggle pressed={true}>Pressed</Toggle>);
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

    it('should have no automated axe violations given disabled toggle', async () => {
      container = mount(<Toggle disabled>Disabled</Toggle>);
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

    it('should have no automated axe violations given asChild toggle', async () => {
      container = mount(
        <Toggle asChild pressed={false}>
          <button type="button">Custom</button>
        </Toggle>
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

  describe('Role & Semantics', () => {
    it('should have implicit button role given native button', () => {
      container = mount(<Toggle>Toggle</Toggle>);
      const button = container.querySelector('button');
      expect(button?.tagName).toBe('BUTTON');
    });

    it('should have role=button given asChild with non-button element', () => {
      container = mount(
        <Toggle asChild>
          <span>Toggle</span>
        </Toggle>
      );
      const span = container.querySelector('span');
      expect(span?.getAttribute('role')).toBe(TOGGLE_A11Y_CONTRACT.ROLE);
    });
  });

  describe('Pressed State', () => {
    it('should apply aria-pressed attribute per contract', () => {
      container = mount(<Toggle pressed={true}>Toggle</Toggle>);
      const button = container.querySelector('button');
      expect(button?.getAttribute(TOGGLE_A11Y_CONTRACT.PRESSED_ATTRIBUTE)).toBe(
        'true'
      );
    });

    it('should default to aria-pressed=false given no pressed prop', () => {
      container = mount(<Toggle>Toggle</Toggle>);
      const button = container.querySelector('button');
      expect(button?.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('Disabled State', () => {
    it('should apply disabled attribute given native button', () => {
      container = mount(<Toggle disabled>Toggle</Toggle>);
      const button = container.querySelector('button');
      expect(button?.hasAttribute('disabled')).toBe(true);
    });

    it('should apply aria-disabled per contract given disabled', () => {
      container = mount(<Toggle disabled>Toggle</Toggle>);
      const button = container.querySelector('button');
      expect(button?.getAttribute('aria-disabled')).toBe(
        TOGGLE_A11Y_CONTRACT.DISABLED_ATTRIBUTES.nativeButton['aria-disabled']
      );
    });

    it('should apply aria-disabled on non-native element given asChild', () => {
      container = mount(
        <Toggle asChild disabled>
          <span>Toggle</span>
        </Toggle>
      );
      const span = container.querySelector('span');
      expect(span?.getAttribute('aria-disabled')).toBe(
        TOGGLE_A11Y_CONTRACT.DISABLED_ATTRIBUTES.nonNative['aria-disabled']
      );
    });

    it('should apply tabIndex=-1 on non-native element given disabled', () => {
      container = mount(
        <Toggle asChild disabled>
          <span>Toggle</span>
        </Toggle>
      );
      const span = container.querySelector('span');
      expect(span?.getAttribute('tabIndex')).toBe(
        String(TOGGLE_A11Y_CONTRACT.DISABLED_ATTRIBUTES.nonNative.tabIndex)
      );
    });
  });

  describe('Focus Management', () => {
    it('should be focusable given enabled toggle', () => {
      container = mount(<Toggle>Toggle</Toggle>);
      const button = container.querySelector('button')!;
      button.focus();
      expect(document.activeElement).toBe(button);
    });

    it('should NOT be in tab order given disabled native button', () => {
      container = mount(<Toggle disabled>Toggle</Toggle>);
      const button = container.querySelector('button');
      expect(button?.hasAttribute('disabled')).toBe(true);
      // Disabled native buttons are implicitly removed from tab order
    });

    it('should have tabIndex=-1 given disabled asChild element', () => {
      container = mount(
        <Toggle asChild disabled>
          <span>Toggle</span>
        </Toggle>
      );
      const span = container.querySelector('span');
      expect(span?.getAttribute('tabIndex')).toBe('-1');
    });
  });

  describe('Accessible Name', () => {
    it('should use text content as accessible name given children', () => {
      container = mount(<Toggle>Mute Audio</Toggle>);
      const button = container.querySelector('button');
      expect(button?.textContent).toBe('Mute Audio');
    });

    it('should support aria-label given explicit label', () => {
      container = mount(<Toggle aria-label="Toggle mute">🔇</Toggle>);
      const button = container.querySelector('button');
      expect(button?.getAttribute('aria-label')).toBe('Toggle mute');
    });

    it('should support aria-labelledby given external label', () => {
      container = mount(
        <>
          <span id="toggle-label">Mute</span>
          <Toggle aria-labelledby="toggle-label">🔇</Toggle>
        </>
      );
      const button = container.querySelector('button');
      expect(button?.getAttribute('aria-labelledby')).toBe('toggle-label');
    });
  });

  describe('Contract Validation', () => {
    it('should support Enter key activation per contract', () => {
      expect(TOGGLE_A11Y_CONTRACT.KEYBOARD_ACTIVATION).toContain('Enter');
    });

    it('should support Space key activation per contract', () => {
      expect(TOGGLE_A11Y_CONTRACT.KEYBOARD_ACTIVATION).toContain('Space');
    });

    it('should define pressed attribute in contract', () => {
      expect(TOGGLE_A11Y_CONTRACT.PRESSED_ATTRIBUTE).toBe('aria-pressed');
    });

    it('should define role in contract', () => {
      expect(TOGGLE_A11Y_CONTRACT.ROLE).toBe('button');
    });
  });
});
