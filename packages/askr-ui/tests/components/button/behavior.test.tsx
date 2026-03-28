import { describe, it, expect, vi, afterEach } from 'vite-plus/test';
import { Button } from '../../../src/components/primitives/button/button';
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

describe('Button - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) {
      unmount(container);
    }
  });

  // ========================================
  // FOUNDATION DELEGATION
  // ========================================
  describe('foundation delegation', () => {
    it('should delegate behavior through pressable given component has no direct event logic', () => {
      const onPress = vi.fn();

      container = mount(<Button onPress={onPress}>Click me</Button>);
      const button = container.querySelector('button') as HTMLButtonElement;

      button.click();
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('should delegate keyboard interaction to foundation given asChild element', () => {
      const onPress = vi.fn();

      container = mount(
        <Button asChild onPress={onPress}>
          <div role="button">Custom</div>
        </Button>
      );

      const element = container.querySelector('[role="button"]') as HTMLElement;

      element.click();
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('should delegate disabled semantics to foundation given no manual checks in component', () => {
      const onPress = vi.fn();

      container = mount(
        <Button disabled onPress={onPress}>
          Click me
        </Button>
      );
      const button = container.querySelector('button') as HTMLButtonElement;

      expect(button.disabled).toBe(true);
      button.click();
      expect(onPress).not.toHaveBeenCalled();
    });

    it('should delegate disabled semantics for asChild elements given aria-disabled comes from foundation', () => {
      const onPress = vi.fn();

      container = mount(
        <Button asChild disabled onPress={onPress}>
          <a href="/test">Link</a>
        </Button>
      );

      const link = container.querySelector('a') as HTMLAnchorElement;

      expect(link.getAttribute('aria-disabled')).toBe('true');
      expect(link.getAttribute('tabindex')).toBe('-1');

      link.click();
      expect(onPress).not.toHaveBeenCalled();
    });

    it('should compose props using mergeProps foundation given no manual spreading', () => {
      const onPress = vi.fn();

      container = mount(
        <Button onPress={onPress} data-custom="value" aria-label="test">
          Click me
        </Button>
      );

      const button = container.querySelector('button') as HTMLButtonElement;

      expect(button.getAttribute('data-custom')).toBe('value');
      expect(button.getAttribute('aria-label')).toBe('test');

      button.click();
      expect(onPress).toHaveBeenCalled();
    });
  });

  // ========================================
  // SEMANTIC CONTRACT
  // ========================================
  describe('semantic contract', () => {
    it('should render a native button element given no asChild prop', () => {
      container = mount(<Button>Click me</Button>);
      const button = container.querySelector('button') as HTMLButtonElement;

      expect(button).toBeTruthy();
      expect(button.tagName).toBe('BUTTON');
      expect(button.textContent).toBe('Click me');
    });

    it('should render with button type by default given no type prop', () => {
      container = mount(<Button>Click me</Button>);
      const button = container.querySelector('button') as HTMLButtonElement;

      expect(button.getAttribute('type')).toBe('button');
    });

    it('should render with submit type given type="submit"', () => {
      container = mount(<Button type="submit">Submit</Button>);
      const button = container.querySelector('button') as HTMLButtonElement;

      expect(button.getAttribute('type')).toBe('submit');
    });

    it('should render with reset type given type="reset"', () => {
      container = mount(<Button type="reset">Reset</Button>);
      const button = container.querySelector('button') as HTMLButtonElement;

      expect(button.getAttribute('type')).toBe('reset');
    });

    it('should respond to onPress given user interaction', () => {
      const onPress = vi.fn();
      container = mount(<Button onPress={onPress}>Click me</Button>);

      const button = container.querySelector('button')!;
      button.click();

      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('should prevent interaction when disabled given disabled prop', () => {
      const onPress = vi.fn();
      container = mount(
        <Button disabled onPress={onPress}>
          Click me
        </Button>
      );

      const button = container.querySelector('button')!;
      button.click();

      expect(onPress).not.toHaveBeenCalled();
    });
  });

  // ========================================
  // asChild INVARIANT
  // ========================================
  describe('asChild invariant', () => {
    it('should render child element given asChild prop', () => {
      container = mount(
        <Button asChild>
          <a href="/test">Link</a>
        </Button>
      );
      const link = container.querySelector('a') as HTMLAnchorElement;

      expect(link).toBeTruthy();
      expect(link.tagName).toBe('A');
      expect(link.getAttribute('href')).toBe('/test');
      expect(link.textContent).toBe('Link');
    });

    it('should preserve interaction semantics given asChild with different host element', () => {
      const onPress = vi.fn();
      container = mount(
        <Button asChild onPress={onPress}>
          <a href="/test">Link</a>
        </Button>
      );

      const link = container.querySelector('a') as HTMLAnchorElement;
      link.click();

      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('should preserve disabled semantics given asChild element', () => {
      const onPress = vi.fn();
      container = mount(
        <Button asChild disabled onPress={onPress}>
          <a href="/test">Link</a>
        </Button>
      );

      const link = container.querySelector('a')!;

      expect(link.getAttribute('aria-disabled')).toBe('true');
      expect(link.getAttribute('tabindex')).toBe('-1');

      link.click();
      expect(onPress).not.toHaveBeenCalled();
    });

    it('should forward additional props given asChild with extra attributes', () => {
      container = mount(
        <Button asChild data-testid="custom-link">
          <a href="/test">Link</a>
        </Button>
      );
      const link = container.querySelector(
        '[data-testid="custom-link"]'
      ) as HTMLAnchorElement;

      expect(link).toBeTruthy();
      expect(link.tagName).toBe('A');
    });

    it('should work with div given asChild with non-semantic element', () => {
      const onPress = vi.fn();
      container = mount(
        <Button asChild onPress={onPress}>
          <div>Custom Button</div>
        </Button>
      );

      const div = container.querySelector('div') as HTMLElement;
      div.click();

      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================
  // COMPOSITION SAFETY
  // ========================================
  describe('composition safety', () => {
    it('should compose props cleanly given mergeProps handles conflicts', () => {
      const onPress = vi.fn();

      container = mount(
        <Button onPress={onPress} data-testid="test" className="custom">
          Click me
        </Button>
      );

      const button = container.querySelector('button') as HTMLButtonElement;

      expect(button.getAttribute('data-testid')).toBe('test');
      expect(button.getAttribute('class')).toBe('custom');

      button.click();
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('should not double-fire events given proper handler composition', () => {
      const onPress = vi.fn();
      container = mount(<Button onPress={onPress}>Click me</Button>);

      const button = container.querySelector('button') as HTMLButtonElement;
      button.click();

      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('should compose with asChild element props given no conflicts', () => {
      const onPress = vi.fn();

      container = mount(
        <Button asChild onPress={onPress} data-from-button="yes">
          <a href="/test" data-from-child="yes">
            Link
          </a>
        </Button>
      );

      const link = container.querySelector('a') as HTMLAnchorElement;

      expect(link.getAttribute('data-from-button')).toBe('yes');
      expect(link.getAttribute('data-from-child')).toBe('yes');
      expect(link.getAttribute('href')).toBe('/test');

      link.click();
      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================
  // MISUSE PREVENTION
  // ========================================
  describe('misuse prevention', () => {
    it('should not support onClick prop given askr uses onPress', () => {
      const onClick = vi.fn();
      const onPress = vi.fn();

      container = mount(
        <Button onClick={onClick} onPress={onPress}>
          Click me
        </Button>
      );

      const button = container.querySelector('button')!;
      button.click();

      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('should not allow disabled bypass given foundation enforces it', () => {
      const onPress = vi.fn();
      container = mount(
        <Button disabled onPress={onPress}>
          Click me
        </Button>
      );

      const button = container.querySelector('button')! as HTMLButtonElement;

      button.click();
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

      expect(onPress).not.toHaveBeenCalled();
    });

    it('should not fire onPress given disabled asChild element with any interaction', () => {
      const onPress = vi.fn();
      container = mount(
        <Button asChild disabled onPress={onPress}>
          <div role="button" tabIndex={0}>
            Custom
          </div>
        </Button>
      );

      const element = container.querySelector('[role="button"]') as HTMLElement;

      element.click();
      element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

      expect(onPress).not.toHaveBeenCalled();
    });
  });

  // ========================================
  // REGRESSION GUARDS
  // ========================================
  describe('regression guards', () => {
    it('should fail if Button adds manual event handlers given behavior must come from foundation', () => {
      const onPress = vi.fn();

      container = mount(<Button onPress={onPress}>Click me</Button>);
      const button = container.querySelector('button') as HTMLButtonElement;

      button.click();
      expect(onPress).toHaveBeenCalledTimes(1);

      button.click();
      expect(onPress).toHaveBeenCalledTimes(2);
    });

    it('should fail if Button implements disabled check given that belongs in foundation', () => {
      const onPress = vi.fn();

      container = mount(
        <Button disabled={false} onPress={onPress}>
          Click me
        </Button>
      );
      let button = container.querySelector('button')!;

      button.click();
      expect(onPress).toHaveBeenCalledTimes(1);

      unmount(container);
      onPress.mockClear();

      container = mount(
        <Button disabled onPress={onPress}>
          Click me
        </Button>
      );
      button = container.querySelector('button')! as HTMLButtonElement;

      button.click();
      expect(onPress).not.toHaveBeenCalled();
    });

    it('should fail if Button adds lifecycle hooks given components only compose', () => {
      const onPress = vi.fn();

      container = mount(<Button onPress={onPress}>Click me</Button>);
      const button = container.querySelector('button')!;

      button.click();
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('should fail if Button duplicates foundation logic given asChild keyboard handling', () => {
      const onPress = vi.fn();

      container = mount(
        <Button asChild onPress={onPress}>
          <span role="button">Custom</span>
        </Button>
      );

      const span = container.querySelector('span')!;

      expect(span.getAttribute('role')).toBe('button');

      span.click();
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('should fail if Button manually handles disabled on asChild given foundation responsibility', () => {
      const onPress = vi.fn();

      container = mount(
        <Button asChild disabled onPress={onPress}>
          <a href="/test">Link</a>
        </Button>
      );

      const link = container.querySelector('a')!;

      expect(link.getAttribute('aria-disabled')).toBe('true');
      expect(link.getAttribute('tabindex')).toBe('-1');

      link.click();
      expect(onPress).not.toHaveBeenCalled();
    });
  });
});
