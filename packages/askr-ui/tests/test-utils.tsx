import { createIsland } from '@askrjs/askr';
import { DefaultPortal } from '@askrjs/askr/foundations';

export function resetTestState() {
  DefaultPortal.render({ children: undefined });
  document
    .querySelectorAll('[data-key="__default_portal"]')
    .forEach((node) => node.parentNode?.removeChild(node));
}

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

  resetTestState();
}
