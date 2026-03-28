import { afterEach, describe, expect, it } from 'vite-plus/test';
import { createIsland } from '@askrjs/askr';
import { Separator } from '../../../src/components/primitives/separator/separator';

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

describe('Separator — Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) {
      unmount(container);
    }
  });

  it('renders a separator role by default', () => {
    container = mount(<Separator />);
    const separator = container.querySelector('div');
    expect(separator?.getAttribute('role')).toBe('separator');
    expect(separator?.getAttribute('aria-orientation')).toBe('horizontal');
  });

  it('renders decorative separators as presentation', () => {
    container = mount(<Separator decorative />);
    const separator = container.querySelector('div');
    expect(separator?.getAttribute('role')).toBe('presentation');
  });
});
