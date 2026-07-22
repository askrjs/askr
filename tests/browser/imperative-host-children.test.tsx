import { expect, test } from 'vite-plus/test';
import { state } from '../../src';
import { createIsland } from '../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';

test('should retain focus inside an imperatively owned host', () => {
  const { container, cleanup } = createTestContainer();
  let update!: () => void;

  function App() {
    const revision = state(0);
    update = () => revision.set((current) => current + 1);

    return (
      <div
        data-revision={revision()}
        data-testid="widget-host"
        imperativeChildren
      />
    );
  }

  try {
    createIsland({ root: container, component: App });
    flushScheduler();

    const host = container.querySelector('[data-testid="widget-host"]')!;
    const input = document.createElement('input');
    host.appendChild(input);
    input.focus();

    update();
    flushScheduler();

    expect(host.firstChild).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(host.getAttribute('data-revision')).toBe('1');
  } finally {
    cleanup();
  }
});
