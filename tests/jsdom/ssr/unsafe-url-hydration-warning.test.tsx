import { afterEach, expect, it, vi } from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import { logger } from '../../../src/common/logger';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { routeRegistryFromTable } from '../../router-test-utils';

afterEach(() => {
  vi.restoreAllMocks();
});

// Development hydration renders the page with the SSR renderer to verify the
// markup and then applies props on the client: both check the blocked URL,
// and it is reported once.
it('should warn once when hydration verifies and applies a blocked URL', async () => {
  const warn = vi.spyOn(logger, 'warn');
  const { container, cleanup } = createTestContainer();
  const Page = () => <a href="vscode://hydrated">link</a>;
  try {
    // The markup a server render produced; its warning was logged there.
    container.innerHTML = '<a>link</a>';
    await hydrateSPA({
      root: container,
      registry: routeRegistryFromTable([{ path: '/', handler: Page }]),
      hydrate: { verifyMarkup: true },
    });
    flushScheduler();
    expect(container.querySelector('a')?.hasAttribute('href')).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(
      warn.mock.calls.map((args) => args.map(String).join(' ')).join('\n')
    ).toContain('"vscode:"');
  } finally {
    cleanup();
  }
});
