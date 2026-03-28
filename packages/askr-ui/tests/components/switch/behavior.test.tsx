import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createIsland } from '@askrjs/askr';
import { Switch } from '../../../src/components/primitives/switch/switch';

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

describe('Switch — Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    if (container) {
      unmount(container);
    }
  });

  it('renders switch semantics instead of toggle semantics', () => {
    container = mount(<Switch defaultChecked>Airplane mode</Switch>);
    const button = container.querySelector('button');
    expect(button?.getAttribute('aria-checked')).toBe('true');
    expect(button?.getAttribute('aria-pressed')).toBeNull();
  });

  it('calls onCheckedChange in controlled mode', () => {
    const onCheckedChange = vi.fn();
    container = mount(
      <Switch checked={false} onCheckedChange={onCheckedChange}>
        Power
      </Switch>
    );
    const button = container.querySelector('button')!;
    button.click();
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('renders hidden form input when named', () => {
    container = mount(
      <Switch name="notifications" defaultChecked value="enabled">
        Notifications
      </Switch>
    );
    const input = container.querySelector('input[type="checkbox"]');
    expect(input?.getAttribute('name')).toBe('notifications');
    expect(input?.getAttribute('value')).toBe('enabled');
  });
});
