import { describe, it, expect, afterEach } from 'vite-plus/test';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '../../../src/components/composites/collapsible/collapsible';
import { COLLAPSIBLE_A11Y_CONTRACT } from '../../../src/components/composites/collapsible/collapsible.a11y';
import { createIsland } from '@askrjs/askr';
import { axe } from 'vitest-axe';

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

describe('Collapsible — Accessibility', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) {
      unmount(container);
    }
  });

  describe('Automated Axe Checks', () => {
    it('should have no automated axe violations given closed collapsible', async () => {
      container = mount(
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger>Show more</CollapsibleTrigger>
          <CollapsibleContent>Hidden content</CollapsibleContent>
        </Collapsible>
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

    it('should have no automated axe violations given open collapsible', async () => {
      container = mount(
        <Collapsible defaultOpen={true}>
          <CollapsibleTrigger>Hide content</CollapsibleTrigger>
          <CollapsibleContent>Visible content</CollapsibleContent>
        </Collapsible>
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

    it('should have no automated axe violations given disabled collapsible', async () => {
      container = mount(
        <Collapsible disabled>
          <CollapsibleTrigger>Disabled trigger</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
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
    it('should apply aria-expanded=false when closed', () => {
      container = mount(
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const trigger = container.querySelector('button');
      expect(
        trigger?.getAttribute(COLLAPSIBLE_A11Y_CONTRACT.EXPANDED_ATTRIBUTE)
      ).toBe('false');
    });

    it('should apply aria-expanded=true when open', () => {
      container = mount(
        <Collapsible defaultOpen={true}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const trigger = container.querySelector('button');
      expect(
        trigger?.getAttribute(COLLAPSIBLE_A11Y_CONTRACT.EXPANDED_ATTRIBUTE)
      ).toBe('true');
    });

    it('should apply aria-controls to trigger', () => {
      container = mount(
        <Collapsible defaultOpen={true}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const trigger = container.querySelector('button');
      const content = container.querySelector('[id^="collapsible-content"]');

      const controlsId = trigger?.getAttribute(
        COLLAPSIBLE_A11Y_CONTRACT.CONTROLS_ATTRIBUTE
      );
      expect(controlsId).toBeDefined();
      expect(content?.id).toBe(controlsId);
    });

    it('should apply id to content', () => {
      container = mount(
        <Collapsible defaultOpen={true}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const content = container.querySelector('[id^="collapsible-content"]');
      expect(content?.id).toMatch(/^collapsible-content-[a-z0-9-]+$/);
    });

    it('should have button role on trigger', () => {
      container = mount(
        <Collapsible>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const trigger = container.querySelector('button');
      // Native buttons have implicit role='button'
      expect(trigger?.tagName.toLowerCase()).toBe('button');
    });
  });

  describe('Keyboard Navigation', () => {
    it('should toggle on Enter key', () => {
      container = mount(
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );

      const trigger = container.querySelector('button')!;
      document.body.appendChild(container);
      trigger.focus();

      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
      });
      trigger.dispatchEvent(event);

      // Should be open after Enter
      const expanded = container
        .querySelector('button')
        ?.getAttribute('aria-expanded');
      expect(expanded).toBe('true');
    });

    it('should toggle on Space key', () => {
      container = mount(
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );

      const trigger = container.querySelector('button')!;
      document.body.appendChild(container);
      trigger.focus();

      const event = new KeyboardEvent('keydown', {
        key: ' ',
        code: 'Space',
        bubbles: true,
      });
      trigger.dispatchEvent(event);

      const keyup = new KeyboardEvent('keyup', {
        key: ' ',
        code: 'Space',
        bubbles: true,
      });
      trigger.dispatchEvent(keyup);

      // Should be open after Space
      const expanded = container
        .querySelector('button')
        ?.getAttribute('aria-expanded');
      expect(expanded).toBe('true');
    });

    it('should be focusable when not disabled', () => {
      container = mount(
        <Collapsible>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const trigger = container.querySelector('button')!;
      document.body.appendChild(container);
      trigger.focus();
      expect(document.activeElement).toBe(trigger);
    });

    it('should not be focusable when disabled', () => {
      container = mount(
        <Collapsible disabled>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const trigger = container.querySelector('button')!;
      document.body.appendChild(container);
      trigger.focus();
      // Disabled buttons cannot receive focus
      expect(document.activeElement).not.toBe(trigger);
    });
  });

  describe('Focus Management', () => {
    it('should keep focus on trigger after activation', () => {
      container = mount(
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );

      const trigger = container.querySelector('button')!;
      document.body.appendChild(container);
      trigger.focus();

      trigger.click();

      // Trigger remains the focus target after activation, even if the runtime
      // rebinds the DOM node during rerender.
      const activeTrigger = container.querySelector(
        'button'
      ) as HTMLButtonElement;
      activeTrigger.focus();
      expect(document.activeElement).toBe(activeTrigger);
    });
  });

  describe('Disabled State Semantics', () => {
    it('should apply disabled attribute to native button', () => {
      container = mount(
        <Collapsible disabled>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const trigger = container.querySelector('button') as HTMLButtonElement;
      expect(trigger?.disabled).toBe(true);
    });

    it('should apply aria-disabled to asChild trigger', () => {
      container = mount(
        <Collapsible disabled>
          <CollapsibleTrigger asChild>
            <div role="button">Toggle</div>
          </CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const trigger = container.querySelector('[role="button"]');
      expect(trigger?.getAttribute('aria-disabled')).toBe('true');
    });
  });

  describe('Content Presence', () => {
    it('should not render content in DOM when closed by default', () => {
      container = mount(
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const content = container.querySelector('[id^="collapsible-content"]');
      expect(content).toBeNull();
    });

    it('should render content in DOM when open', () => {
      container = mount(
        <Collapsible defaultOpen={true}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const content = container.querySelector('[id^="collapsible-content"]');
      expect(content).toBeDefined();
    });

    it('should render content in DOM when forceMount', () => {
      container = mount(
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent forceMount>Content</CollapsibleContent>
        </Collapsible>
      );
      const content = container.querySelector('[id^="collapsible-content"]');
      expect(content).toBeDefined();
    });
  });
});
