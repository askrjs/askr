import { describe, it, expect, afterEach } from 'vitest';
import { axe } from 'vitest-axe';
import { Button } from '../../../src/components/button/button';
import { createIsland } from '@askrjs/askr';
import { BUTTON_A11Y_CONTRACT } from '../../../src/components/button/button.a11y';

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

describe('Button - Accessibility', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) {
      unmount(container);
    }
  });

  // ========================================
  // AUTOMATED AXE CHECKS
  // ========================================
  describe('automated axe checks', () => {
    it('should have no automated axe violations given default button', async () => {
      container = mount(<Button>Click me</Button>);
      const results = await axe(container);

      if (results.violations.length > 0) {
        throw new Error(
          `Axe violations found:\n${results.violations
            .map((v) => `- ${v.id}: ${v.description}`)
            .join('\n')}`
        );
      }
    });

    it('should have no automated axe violations given disabled button', async () => {
      container = mount(<Button disabled>Click me</Button>);
      const results = await axe(container);

      if (results.violations.length > 0) {
        throw new Error(
          `Axe violations found:\n${results.violations
            .map((v) => `- ${v.id}: ${v.description}`)
            .join('\n')}`
        );
      }
    });

    it('should have no automated axe violations given asChild button', async () => {
      container = mount(
        <Button asChild>
          <a href="/test">Link</a>
        </Button>
      );
      const results = await axe(container);

      if (results.violations.length > 0) {
        throw new Error(
          `Axe violations found:\n${results.violations
            .map((v) => `- ${v.id}: ${v.description}`)
            .join('\n')}`
        );
      }
    });

    it('should have no automated axe violations given button with aria-label', async () => {
      container = mount(<Button aria-label="Close dialog">×</Button>);
      const results = await axe(container);

      if (results.violations.length > 0) {
        throw new Error(
          `Axe violations found:\n${results.violations
            .map((v) => `- ${v.id}: ${v.description}`)
            .join('\n')}`
        );
      }
    });
  });

  // ========================================
  // ROLE & SEMANTICS
  // ========================================
  describe('role and semantics', () => {
    it('should have implicit button role given native button element', () => {
      container = mount(<Button>Click me</Button>);
      const button = container.querySelector('button')!;

      // Native buttons have implicit role="button"
      expect(button.tagName).toBe('BUTTON');
    });

    it('should preserve child role given asChild element', () => {
      container = mount(
        <Button asChild>
          <a href="/test" role="button">
            Link
          </a>
        </Button>
      );
      const link = container.querySelector('a')!;

      expect(link.getAttribute('role')).toBe('button');
    });

    it('should apply button type attribute given native button', () => {
      container = mount(<Button type="submit">Submit</Button>);
      const button = container.querySelector('button')!;

      expect(button.getAttribute('type')).toBe('submit');
    });
  });

  // ========================================
  // DISABLED STATE
  // ========================================
  describe('disabled state', () => {
    it('should use native disabled attribute given disabled native button', () => {
      container = mount(<Button disabled>Click me</Button>);
      const button = container.querySelector('button')! as HTMLButtonElement;

      expect(button.disabled).toBe(true);
      // In jsdom, disabled attribute is set as "true" string
      expect(button.hasAttribute('disabled')).toBe(true);
    });

    it('should use aria-disabled given disabled asChild element', () => {
      container = mount(
        <Button asChild disabled>
          <a href="/test">Link</a>
        </Button>
      );
      const link = container.querySelector('a')!;

      expect(link.getAttribute('aria-disabled')).toBe('true');
    });

    it('should remove from tab order given disabled asChild element', () => {
      container = mount(
        <Button asChild disabled>
          <a href="/test">Link</a>
        </Button>
      );
      const link = container.querySelector('a')!;

      expect(link.getAttribute('tabindex')).toBe('-1');
    });

    it('should match contract expectations given disabled attributes', () => {
      // Verify implementation matches documented contract
      const { DISABLED_ATTRIBUTES } = BUTTON_A11Y_CONTRACT;

      expect(DISABLED_ATTRIBUTES.native).toBe('disabled');
      expect(DISABLED_ATTRIBUTES.asChild).toBe('aria-disabled');
    });
  });

  // ========================================
  // FOCUS MANAGEMENT
  // ========================================
  describe('focus management', () => {
    it('should be focusable given enabled native button', () => {
      container = mount(<Button>Click me</Button>);
      const button = container.querySelector('button')!;

      // Native buttons are focusable
      expect(button.tabIndex).toBeGreaterThanOrEqual(0);
    });

    it('should not be focusable given disabled native button', () => {
      container = mount(<Button disabled>Click me</Button>);
      const button = container.querySelector('button')! as HTMLButtonElement;

      // Disabled buttons are removed from tab order
      expect(button.disabled).toBe(true);
    });

    it('should not be focusable given disabled asChild element', () => {
      container = mount(
        <Button asChild disabled>
          <a href="/test">Link</a>
        </Button>
      );
      const link = container.querySelector('a')!;

      expect(link.getAttribute('tabindex')).toBe('-1');
    });
  });

  // ========================================
  // ACCESSIBLE NAME
  // ========================================
  describe('accessible name', () => {
    it('should use text content as accessible name given text children', () => {
      container = mount(<Button>Save changes</Button>);
      const button = container.querySelector('button')!;

      expect(button.textContent).toBe('Save changes');
    });

    it('should use aria-label as accessible name given aria-label prop', () => {
      container = mount(<Button aria-label="Close">×</Button>);
      const button = container.querySelector('button')!;

      expect(button.getAttribute('aria-label')).toBe('Close');
    });

    it('should support aria-labelledby given aria-labelledby prop', () => {
      container = mount(
        <div>
          <span id="label-id">Submit Form</span>
          <Button aria-labelledby="label-id">Submit</Button>
        </div>
      );
      const button = container.querySelector('button')!;

      expect(button.getAttribute('aria-labelledby')).toBe('label-id');
    });
  });

  // ========================================
  // CONTRACT VALIDATION
  // ========================================
  describe('contract validation', () => {
    it('should match documented keyboard activation keys', () => {
      const { KEYBOARD_ACTIVATION } = BUTTON_A11Y_CONTRACT;

      expect(KEYBOARD_ACTIVATION).toEqual(['Enter', 'Space']);
    });

    it('should match documented role', () => {
      const { ROLE } = BUTTON_A11Y_CONTRACT;

      expect(ROLE).toBe('button');
    });

    it('should match documented focus rules', () => {
      const { FOCUS_RULES } = BUTTON_A11Y_CONTRACT;

      expect(FOCUS_RULES.enabled).toBe('focusable');
      expect(FOCUS_RULES.disabled).toBe('not-focusable');
    });
  });
});
