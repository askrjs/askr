import { afterEach, describe, expect, it } from 'vitest';
import { createIsland } from '@askrjs/askr';
import { Input } from '../../../src/components/input/input';

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
});
