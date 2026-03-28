import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createIsland } from '@askrjs/askr';
import {
  DebouncedInput,
  Input,
} from '../../../src/components/primitives/input/input';
import { flushUpdates } from '../../test-utils';

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

  it('forwards onInput and debounces committed value', async () => {
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
    await flushUpdates();
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

  it('should cancel pending debounced input on unmount', () => {
    vi.useFakeTimers();

    const committedValues: string[] = [];

    container = mount(
      <DebouncedInput
        debounceMs={200}
        onDebouncedInput={(value) => committedValues.push(value)}
      />
    );

    const input = container.querySelector('input') as HTMLInputElement;
    input.value = 'pending';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    unmount(container);
    container = undefined as unknown as HTMLElement;

    vi.advanceTimersByTime(250);

    expect(committedValues).toEqual([]);
  });
});
