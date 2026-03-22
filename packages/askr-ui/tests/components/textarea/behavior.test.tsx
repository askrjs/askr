import { afterEach, describe, expect, it } from 'vitest';
import { createIsland } from '@askrjs/askr';
import { Textarea } from '../../../src/components/textarea/textarea';

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

describe('Textarea — Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) {
      unmount(container);
    }
  });

  it('renders a native textarea by default', () => {
    container = mount(<Textarea rows={4}>Notes</Textarea>);
    const textarea = container.querySelector('textarea');
    expect(textarea?.getAttribute('rows')).toBe('4');
    expect(textarea?.textContent).toBe('Notes');
  });

  it('applies disabled semantics to native textarea', () => {
    container = mount(<Textarea disabled />);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
    expect(textarea.getAttribute('aria-disabled')).toBe('true');
  });

  it('supports asChild composition', () => {
    container = mount(
      <Textarea asChild disabled>
        <div role="textbox">Notes</div>
      </Textarea>
    );
    const div = container.querySelector('div');
    expect(div?.getAttribute('aria-disabled')).toBe('true');
  });
});
