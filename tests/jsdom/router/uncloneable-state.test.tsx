import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { cleanupApp, createSPA } from '../../../src/boot';
import { navigate } from '../../../src/router/navigate';
import { routeRegistryFromTable } from '../../router-test-utils';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

/**
 * History state must be structured-cloneable. A value that cannot be cloned
 * is rejected before the destination renders, so the page and the URL never
 * disagree about where the user is.
 */
describe('navigation with uncloneable state', () => {
  let view: ReturnType<typeof createTestContainer>;
  beforeEach(() => {
    view = createTestContainer();
    window.history.replaceState({}, '', '/first');
  });
  afterEach(() => {
    cleanupApp(view.container);
    view.cleanup();
    window.history.replaceState({}, '', '/');
  });

  it('should reject uncloneable state before the destination commits', async () => {
    await createSPA({
      root: view.container,
      registry: routeRegistryFromTable([
        { path: '/first', handler: () => <p>{'first'}</p> },
        { path: '/second', handler: () => <p>{'second'}</p> },
      ]),
    });
    expect(() => navigate('/second', { state: { callback: () => 1 } })).toThrow(
      /clone/
    );
    expect(view.container.textContent).toBe('first');
    expect(window.location.pathname).toBe('/first');
  });
});
