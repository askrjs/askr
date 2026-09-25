import { expect, test } from 'vite-plus/test';
import { state } from '../../../src';
import { hydrateSPA } from '../../../src/boot';
import { renderToStringSync } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { routeRegistryFromTable } from '../../router-test-utils';

test('should keep reflected prop: attributes when updating hydrated markup', async () => {
  const { container, cleanup } = createTestContainer();
  let bump!: () => void;
  function Page() {
    const count = state(0);
    bump = () => count.set((value) => value + 1);
    return (
      <a prop:href="https://example.com/a" prop:title="A" data-n={count()}>
        a
      </a>
    );
  }
  try {
    container.innerHTML = renderToStringSync(Page);
    await hydrateSPA({
      root: container,
      registry: routeRegistryFromTable([{ path: '/', handler: Page }]),
    });
    flushScheduler();
    bump();
    flushScheduler();
    const anchor = container.querySelector('a')!;
    expect(anchor.getAttribute('data-n')).toBe('1');
    expect(anchor.getAttribute('href')).toBe('https://example.com/a');
    expect(anchor.getAttribute('title')).toBe('A');
  } finally {
    cleanup();
  }
});
