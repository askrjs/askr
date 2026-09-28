import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import { activateHydrationBoundary } from '../../../src/boot/root-lifecycle';
import { dormantHostFor } from '../../../src/core/dom/nodes';
import { renderToStringSync } from '../../../src/ssr';
import { routeRegistryFromTable } from '../../router-test-utils';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

describe('dormant hydration rollback', () => {
  let container: HTMLDivElement;
  let cleanup: () => void;

  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('should keep a failed activation registered and retryable', async () => {
    const App = () => (
      <main>
        <section class="deferred">
          <button>ready</button>
        </section>
      </main>
    );
    const routes = [{ path: '/', handler: App }];
    container.innerHTML = renderToStringSync(() => <App />);
    const boundary = container.querySelector('.deferred')!;
    boundary.setAttribute('data-server-only', 'yes');
    const removeAttribute = boundary.removeAttribute.bind(boundary);
    const failure = new Error('deferred cleanup failed');
    let shouldFail = true;
    vi.spyOn(boundary, 'removeAttribute').mockImplementation((name) => {
      removeAttribute(name);
      if (name === 'data-skip-hydrate' && shouldFail) {
        shouldFail = false;
        throw failure;
      }
    });

    await hydrateSPA({
      root: container,
      registry: routeRegistryFromTable(routes),
      hydrate: { skipSelectors: ['.deferred'], verifyMarkup: false },
    });

    expect(boundary.hasAttribute('data-skip-hydrate')).toBe(true);
    expect(dormantHostFor(boundary)).not.toBeNull();
    expect(() => activateHydrationBoundary(container, boundary)).toThrow(
      failure
    );
    expect(boundary.hasAttribute('data-skip-hydrate')).toBe(true);
    expect(dormantHostFor(boundary)).not.toBeNull();
    expect(boundary.getAttribute('data-server-only')).toBe('yes');

    expect(activateHydrationBoundary(container, boundary)).toBe(true);
    expect(boundary.hasAttribute('data-skip-hydrate')).toBe(false);
    expect(boundary.hasAttribute('data-server-only')).toBe(false);
    expect(dormantHostFor(boundary)).toBeNull();
  });

  it('should preserve matching raw descendants when a dormant host activates', async () => {
    const html = '<button disabled>ready</button>';
    const App = () => (
      <main>
        <section class="deferred" dangerouslySetInnerHTML={{ __html: html }} />
      </main>
    );
    const routes = [{ path: '/', handler: App }];
    container.innerHTML = renderToStringSync(() => <App />);
    const boundary = container.querySelector('.deferred')!;
    const serverNode = boundary.firstChild;

    await hydrateSPA({
      root: container,
      registry: routeRegistryFromTable(routes),
      hydrate: { skipSelectors: ['.deferred'], verifyMarkup: false },
    });

    expect(dormantHostFor(boundary)).not.toBeNull();
    expect(activateHydrationBoundary(container, boundary)).toBe(true);
    expect(boundary.firstChild).toBe(serverNode);
  });
});
