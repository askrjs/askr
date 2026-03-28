import { describe, it, expect, vi, afterEach } from 'vite-plus/test';
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

describe('Collapsible — Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) {
      unmount(container);
    }
  });

  describe('State Management', () => {
    it('should start closed given no defaultOpen', () => {
      container = mount(
        <Collapsible>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const content = container.querySelector('#collapsible-content-1');
      expect(content).toBeNull(); // unmounted when closed
    });

    it('should start open given defaultOpen=true', () => {
      container = mount(
        <Collapsible defaultOpen={true}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const content = container.textContent;
      expect(content).toContain('Content');
    });

    it('should toggle state given click on trigger', () => {
      container = mount(
        <Collapsible>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );

      const trigger = container.querySelector('button')!;

      // Initially closed
      let content = container.textContent;
      expect(content).not.toContain('Content');

      // Click to open
      trigger.click();
      content = container.textContent;
      expect(content).toContain('Content');

      // Click to close
      container.querySelector('button')!.click();
      content = container.textContent;
      expect(content).not.toContain('Content');
    });
  });

  describe('Controlled Mode', () => {
    it('should use controlled open state', () => {
      container = mount(
        <Collapsible open={true}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const content = container.textContent;
      expect(content).toContain('Content');
    });

    it('should call onOpenChange when trigger activated', () => {
      const onOpenChange = vi.fn();
      container = mount(
        <Collapsible open={false} onOpenChange={onOpenChange}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );

      const trigger = container.querySelector('button')!;
      trigger.click();

      expect(onOpenChange).toHaveBeenCalledWith(true);
    });
  });

  describe('Trigger Component', () => {
    it('should render native button by default', () => {
      container = mount(
        <Collapsible>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const button = container.querySelector('button');
      expect(button).toBeDefined();
      expect(button?.textContent).toBe('Toggle');
    });

    it('should set type=button on native button', () => {
      container = mount(
        <Collapsible>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const button = container.querySelector('button');
      expect(button?.getAttribute('type')).toBe('button');
    });

    it('should support asChild rendering', () => {
      container = mount(
        <Collapsible>
          <CollapsibleTrigger asChild>
            <span>Custom Trigger</span>
          </CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const span = container.querySelector('span');
      expect(span).toBeDefined();
      expect(span?.textContent).toBe('Custom Trigger');
    });
  });

  describe('Content Component', () => {
    it('should unmount when closed by default', () => {
      container = mount(
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const contentElement = container.querySelector(
        '[id^="collapsible-content"]'
      );
      expect(contentElement).toBeNull();
    });

    it('should mount when open', () => {
      container = mount(
        <Collapsible defaultOpen={true}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );
      const contentElement = container.querySelector(
        '[id^="collapsible-content"]'
      );
      expect(contentElement).toBeDefined();
      expect(contentElement?.textContent).toBe('Content');
    });

    it('should force mount when forceMount=true', () => {
      container = mount(
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent forceMount>Content</CollapsibleContent>
        </Collapsible>
      );
      const contentElement = container.querySelector(
        '[id^="collapsible-content"]'
      );
      expect(contentElement).toBeDefined();
      expect(contentElement?.textContent).toBe('Content');
    });

    it('should support asChild rendering', () => {
      container = mount(
        <Collapsible defaultOpen={true}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent asChild>
            <section>Custom Content</section>
          </CollapsibleContent>
        </Collapsible>
      );
      const section = container.querySelector('section');
      expect(section).toBeDefined();
      expect(section?.textContent).toBe('Custom Content');
    });
  });

  describe('Disabled State', () => {
    it('should not toggle when disabled', () => {
      const onOpenChange = vi.fn();
      container = mount(
        <Collapsible disabled onOpenChange={onOpenChange}>
          <CollapsibleTrigger>Toggle</CollapsibleTrigger>
          <CollapsibleContent>Content</CollapsibleContent>
        </Collapsible>
      );

      const trigger = container.querySelector('button')!;
      trigger.click();

      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  describe('Context Requirements', () => {
    it('should throw when Trigger used without Collapsible', () => {
      expect(() => {
        mount(<CollapsibleTrigger>Invalid</CollapsibleTrigger>);
      }).toThrow('Collapsible components must be used within <Collapsible>');
    });

    it('should throw when Content used without Collapsible', () => {
      expect(() => {
        mount(<CollapsibleContent>Invalid</CollapsibleContent>);
      }).toThrow('Collapsible components must be used within <Collapsible>');
    });
  });

  describe('Unique IDs', () => {
    it('should generate unique IDs for multiple collapsibles', () => {
      container = mount(
        <div>
          <Collapsible defaultOpen={true}>
            <CollapsibleTrigger>Toggle 1</CollapsibleTrigger>
            <CollapsibleContent>Content 1</CollapsibleContent>
          </Collapsible>
          <Collapsible defaultOpen={true}>
            <CollapsibleTrigger>Toggle 2</CollapsibleTrigger>
            <CollapsibleContent>Content 2</CollapsibleContent>
          </Collapsible>
        </div>
      );

      const contents = container.querySelectorAll(
        '[id^="collapsible-content"]'
      );
      expect(contents.length).toBe(2);

      const ids = Array.from(contents).map((el) => el.id);
      expect(new Set(ids).size).toBe(2); // All unique
    });
  });
});
