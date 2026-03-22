import { afterEach, describe, expect, it } from 'vitest';
import { createIsland } from '@askrjs/askr';
import { VisuallyHidden } from '../../../src/components/visually-hidden/visually-hidden';

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

describe('VisuallyHidden — Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) {
      unmount(container);
    }
  });

  it('renders a hidden span by default', () => {
    container = mount(<VisuallyHidden>Hidden text</VisuallyHidden>);
    const span = container.querySelector('span');
    expect(span?.textContent).toBe('Hidden text');
    expect(span?.getAttribute('data-askr-visually-hidden')).toBe('true');
  });

  it('supports asChild composition', () => {
    container = mount(
      <VisuallyHidden asChild>
        <strong>Hidden</strong>
      </VisuallyHidden>
    );
    const strong = container.querySelector('strong');
    expect(strong?.getAttribute('data-askr-visually-hidden')).toBe('true');
  });
});
