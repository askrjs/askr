import { afterEach, expect, test } from 'vite-plus/test';
import { state } from '../../../src';
import { cleanupApp, createIsland } from '../../../src/boot';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function mount() {
  const { container, cleanup } = createTestContainer();
  cleanups.push(() => {
    cleanupApp(container);
    cleanup();
  });
  container.innerHTML = '<div><input id="i" value="typed"><p>hi</p></div>';
  return container;
}

function Island() {
  const count = state(0);
  return (
    <div>
      <input id="i" />
      <p onClick={() => count.set((n) => n + 1)}>hi {count()}</p>
    </div>
  );
}

test('should adopt existing server elements when hydrate is omitted', () => {
  const container = mount();
  const input = container.querySelector('input')!;
  input.focus();
  input.value = 'user typed';
  createIsland({ root: container, component: Island });
  flushScheduler();
  expect(container.querySelector('input')).toBe(input);
  expect(input.value).toBe('user typed');
  expect(document.activeElement).toBe(input);
  container.querySelector('p')!.click();
  flushScheduler();
  expect(container.querySelector('p')!.textContent).toBe('hi 1');
});

test('should replace existing children when hydrate is false', () => {
  const container = mount();
  const input = container.querySelector('input')!;
  createIsland({ root: container, component: Island, hydrate: false });
  expect(container.querySelector('input')).not.toBe(input);
});

test('should adopt existing children when hydrate is true', () => {
  const container = mount();
  const input = container.querySelector('input')!;
  createIsland({ root: container, component: Island, hydrate: true });
  expect(container.querySelector('input')).toBe(input);
});

test('should render fresh into an empty container when hydrate is omitted', () => {
  const { container, cleanup } = createTestContainer();
  cleanups.push(() => {
    cleanupApp(container);
    cleanup();
  });
  createIsland({ root: container, component: Island });
  expect(container.querySelector('p')!.textContent).toBe('hi 0');
});

test('should fall back to the client tree when the server markup mismatches', () => {
  const { container, cleanup } = createTestContainer();
  cleanups.push(() => {
    cleanupApp(container);
    cleanup();
  });
  container.innerHTML = '<section><span>other</span></section>';
  createIsland({ root: container, component: Island });
  expect(container.querySelector('section')).toBeNull();
  expect(container.querySelector('p')!.textContent).toBe('hi 0');
});
