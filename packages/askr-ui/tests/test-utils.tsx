import { createIsland } from '@askrjs/askr';
import { _resetDefaultPortal } from '../node_modules/@askrjs/askr/dist/foundations/structures/portal.js';

export function mount(element: JSX.Element): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  createIsland({
    root: container,
    component: () => element,
  });
  return container;
}

export async function flushUpdates() {
  await Promise.resolve();
  await Promise.resolve();
}

export function unmount(container: HTMLElement | undefined) {
  if (container?.parentNode) {
    container.parentNode.removeChild(container);
  }

  _resetDefaultPortal();
}
