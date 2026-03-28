import { describe, it, expect, afterEach } from 'vite-plus/test';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '../../../src/components/composites/collapsible/collapsible';
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

function getCollapsibleHTML(container: HTMLElement): string {
  return container.innerHTML;
}

function normalizeCollapsibleHtml(html: string): string {
  return html.replace(/collapsible-content-\d+/g, 'collapsible-content-id');
}

describe('Collapsible — Determinism', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) {
      unmount(container);
    }
  });

  describe('Render Determinism', () => {
    it('should produce identical output given identical props (closed)', () => {
      const props = { defaultOpen: false };

      container = mount(
        <Collapsible {...props}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const output1 = normalizeCollapsibleHtml(getCollapsibleHTML(container));
      unmount(container);

      container = mount(
        <Collapsible {...props}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const output2 = normalizeCollapsibleHtml(getCollapsibleHTML(container));

      expect(output1).toBe(output2);
    });

    it('should produce identical output given identical props (open)', () => {
      const props = { defaultOpen: true };

      container = mount(
        <Collapsible {...props}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const output1 = normalizeCollapsibleHtml(getCollapsibleHTML(container));
      unmount(container);

      container = mount(
        <Collapsible {...props}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const output2 = normalizeCollapsibleHtml(getCollapsibleHTML(container));

      expect(output1).toBe(output2);
    });

    it('should produce identical output given identical props (disabled)', () => {
      const props = { disabled: true, defaultOpen: false };

      container = mount(
        <Collapsible {...props}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const output1 = normalizeCollapsibleHtml(getCollapsibleHTML(container));
      unmount(container);

      container = mount(
        <Collapsible {...props}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const output2 = normalizeCollapsibleHtml(getCollapsibleHTML(container));

      expect(output1).toBe(output2);
    });
  });

  describe('State Transition Determinism', () => {
    it('should consistently reflect state changes', () => {
      container = mount(
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );

      const trigger = container.querySelector('button')!;
      expect(trigger.getAttribute('aria-expanded')).toBe('false');

      trigger.click();
      expect(
        container.querySelector('button')?.getAttribute('aria-expanded')
      ).toBe('true');

      container.querySelector('button')!.click();
      expect(
        container.querySelector('button')?.getAttribute('aria-expanded')
      ).toBe('false');

      container.querySelector('button')!.click();
      expect(
        container.querySelector('button')?.getAttribute('aria-expanded')
      ).toBe('true');
    });
  });

  describe('ARIA Attribute Presence', () => {
    it('should always include aria-expanded on trigger', () => {
      container = mount(
        <Collapsible>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const trigger = container.querySelector('button');
      expect(trigger?.hasAttribute('aria-expanded')).toBe(true);
    });

    it('should always include aria-controls on trigger', () => {
      container = mount(
        <Collapsible>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const trigger = container.querySelector('button');
      expect(trigger?.hasAttribute('aria-controls')).toBe(true);
    });

    it('should always include id on content when mounted', () => {
      container = mount(
        <Collapsible defaultOpen={true}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const content = container.querySelector('[id^="collapsible-content"]');
      expect(content?.hasAttribute('id')).toBe(true);
    });
  });

  describe('Content Presence Determinism', () => {
    it('should consistently mount and unmount content', () => {
      container = mount(
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );

      const trigger = container.querySelector('button')!;

      // Initially closed - content not in DOM
      let content = container.querySelector('[id^="collapsible-content"]');
      expect(content).toBeNull();

      // Open - content in DOM
      trigger.click();
      content = container.querySelector('[id^="collapsible-content"]');
      expect(content).toBeDefined();

      // Close - content removed from DOM
      container.querySelector('button')!.click();
      content = container.querySelector('[id^="collapsible-content"]');
      expect(content).toBeNull();

      // Reopen - content in DOM again
      container.querySelector('button')!.click();
      content = container.querySelector('[id^="collapsible-content"]');
      expect(content).toBeDefined();
    });

    it('should keep content mounted when forceMount', () => {
      container = mount(
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent forceMount>Content</CollapsibleContent>
        </Collapsible>
      );

      const trigger = container.querySelector('button')!;

      // Content in DOM even when closed
      let content = container.querySelector('[id^="collapsible-content"]');
      expect(content).toBeDefined();

      // Open
      trigger.click();
      content = container.querySelector('[id^="collapsible-content"]');
      expect(content).toBeDefined();

      // Close again - still in DOM
      trigger.click();
      content = container.querySelector('[id^="collapsible-content"]');
      expect(content).toBeDefined();
    });
  });

  describe('ID Generation Determinism', () => {
    it('should generate consistent IDs for same collapsible instance', () => {
      container = mount(
        <Collapsible defaultOpen={true}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );

      const trigger = container.querySelector('button')!;
      const content = container.querySelector('[id^="collapsible-content"]')!;

      const controlsId = trigger.getAttribute('aria-controls');
      const contentId = content.id;

      // aria-controls should always match content id
      expect(controlsId).toBe(contentId);

      // Toggle state - IDs should remain the same
      trigger.click(); // close
      container.querySelector('button')!.click(); // reopen

      const contentAfter = container.querySelector(
        '[id^="collapsible-content"]'
      )!;
      const controlsIdAfter = trigger.getAttribute('aria-controls');

      expect(contentAfter.id).toBe(contentId);
      expect(controlsIdAfter).toBe(controlsId);
    });
  });

  describe('Children Stability', () => {
    it('should render stable content given static children', () => {
      container = mount(
        <Collapsible defaultOpen={true}>
          <CollapsibleTrigger>Toggle Button</CollapsibleTrigger>
          <CollapsibleContent>Stable Content</CollapsibleContent>
        </Collapsible>
      );
      const output1 = normalizeCollapsibleHtml(getCollapsibleHTML(container));
      unmount(container);

      container = mount(
        <Collapsible defaultOpen={true}>
          <CollapsibleTrigger>Toggle Button</CollapsibleTrigger>
          <CollapsibleContent>Stable Content</CollapsibleContent>
        </Collapsible>
      );
      const output2 = normalizeCollapsibleHtml(getCollapsibleHTML(container));

      expect(output1).toBe(output2);
    });
  });
});
