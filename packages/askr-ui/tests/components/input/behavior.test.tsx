import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createIsland } from '@askrjs/askr';
import { DebouncedInput, Input } from '../../../src/components/input/input';

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

describe('Input — Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    vi.useRealTimers();

    if (container) {
      unmount(container);
    }
  });

  it('renders a native input by default', () => {
    container = mount(<Input type="email" placeholder="Email" />);
    const input = container.querySelector('input');
    expect(input?.getAttribute('type')).toBe('email');
    expect(input?.getAttribute('placeholder')).toBe('Email');
  });

  it('applies disabled semantics to native input', () => {
    container = mount(<Input disabled />);
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.getAttribute('aria-disabled')).toBe('true');
  });

  it('supports asChild composition', () => {
    container = mount(
      <Input asChild disabled>
        <div role="textbox">Custom input</div>
      </Input>
    );
    const div = container.querySelector('div');
    expect(div?.getAttribute('aria-disabled')).toBe('true');
  });

  it('forwards onInput and debounces committed value', () => {
    vi.useFakeTimers();

    const typedValues: string[] = [];
    const committedValues: string[] = [];

    container = mount(
      <DebouncedInput
        debounceMs={200}
        onInput={(event) => typedValues.push(event.target.value)}
        onDebouncedInput={(value) => committedValues.push(value)}
      />
    );

    const input = container.querySelector('input') as HTMLInputElement;

    input.value = 'n';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    input.value = 'no';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    input.value = 'nor';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(typedValues).toEqual(['n', 'no', 'nor']);
    expect(committedValues).toEqual([]);

    vi.advanceTimersByTime(199);
    expect(committedValues).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(committedValues).toEqual(['nor']);
  });

  it('emits immediate committed input when debounceMs is zero', () => {
    const committedValues: string[] = [];

    container = mount(
      <DebouncedInput
        debounceMs={0}
        onDebouncedInput={(value) => committedValues.push(value)}
      />
    );

    const input = container.querySelector('input') as HTMLInputElement;
    input.value = 'northwind';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(committedValues).toEqual(['northwind']);
  });
});
