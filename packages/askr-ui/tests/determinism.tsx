import { expect } from 'vitest';
import { mount, unmount } from './test-utils';

export function renderHtml(element: JSX.Element) {
  const container = mount(element);

  try {
    return container.innerHTML;
  } finally {
    unmount(container);
  }
}

export function expectDeterministicRender(factory: () => JSX.Element) {
  const first = renderHtml(factory());
  const second = renderHtml(factory());

  expect(first).toBe(second);
}
