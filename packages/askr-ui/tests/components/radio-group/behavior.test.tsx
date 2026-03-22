import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIsland } from '@askrjs/askr';
import {
  RadioGroup,
  RadioGroupItem,
} from '../../../src/components/radio-group/radio-group';

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

describe('RadioGroup — Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) {
      unmount(container);
    }
  });

  it('renders radiogroup semantics in uncontrolled mode', () => {
    container = mount(
      <RadioGroup defaultValue="b">
        <RadioGroupItem value="a">A</RadioGroupItem>
        <RadioGroupItem value="b">B</RadioGroupItem>
      </RadioGroup>
    );

    const group = container.querySelector('[role="radiogroup"]');
    const items = container.querySelectorAll('button');

    expect(group).toBeTruthy();
    expect(items[0]?.getAttribute('aria-checked')).toBe('false');
    expect(items[1]?.getAttribute('aria-checked')).toBe('true');
  });

  it('calls onValueChange when a different item is selected', () => {
    const onValueChange = vi.fn();
    container = mount(
      <RadioGroup value="a" onValueChange={onValueChange}>
        <RadioGroupItem value="a">A</RadioGroupItem>
        <RadioGroupItem value="b">B</RadioGroupItem>
      </RadioGroup>
    );

    const items = container.querySelectorAll('button');
    items[1]?.click();

    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('renders a hidden input when name is provided', () => {
    container = mount(
      <RadioGroup name="size" defaultValue="m">
        <RadioGroupItem value="s">S</RadioGroupItem>
        <RadioGroupItem value="m">M</RadioGroupItem>
      </RadioGroup>
    );

    const input = container.querySelector('input[type="hidden"]');
    expect(input?.getAttribute('name')).toBe('size');
    expect(input?.getAttribute('value')).toBe('m');
  });
});
