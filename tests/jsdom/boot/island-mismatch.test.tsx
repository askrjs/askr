import { afterEach, expect, it } from 'vite-plus/test';
import { cleanupApp, createIsland } from '../../../src/boot';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

type Info = { path: string; expected: string; actual: string };

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const Page = () => (
  <main>
    <div>a</div>
    <div>
      <span>x</span>
    </div>
  </main>
);

it('should notify onMismatch for a createIsland mismatch without failing', () => {
  const { container, cleanup } = createTestContainer();
  cleanups.push(() => {
    cleanupApp(container);
    cleanup();
  });
  container.innerHTML = '<main><div>a</div><div><p>x</p></div></main>';
  const seen: Info[] = [];
  createIsland({
    root: container,
    component: Page,
    hydrate: { onMismatch: (info: Info) => void seen.push(info) },
  });
  expect(seen[0]).toEqual({
    path: 'main > div:nth-child(2) > p',
    expected: '<span>',
    actual: '<p>',
  });
  expect(container.querySelector('span')).not.toBeNull();
  expect(container.querySelector('p')).toBeNull();
});
