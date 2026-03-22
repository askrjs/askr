import { afterEach, describe, expect, it } from 'vitest';
import { createIsland } from '@askrjs/askr';
import { Label } from '../../../src/components/label/label';

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

describe('Label — Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) {
      unmount(container);
    }
  });

  it('renders a native label by default', () => {
    container = mount(<Label htmlFor="email">Email</Label>);
    const label = container.querySelector('label') as HTMLLabelElement | null;
    expect(label?.textContent).toBe('Email');
    expect(label).toBeTruthy();
  });

  it('supports asChild composition', () => {
    container = mount(
      <Label asChild data-testid="composed-label">
        <span>Email</span>
      </Label>
    );
    const span = container.querySelector('span');
    expect(span?.getAttribute('data-testid')).toBe('composed-label');
  });
});
