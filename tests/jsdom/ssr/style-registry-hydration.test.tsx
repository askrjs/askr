import { afterEach, describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src';
import { hydrateSPA } from '../../../src/boot';
import { renderToStringSync } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { routeRegistryFromTable } from '../../router-test-utils';

/**
 * `@askrjs/server` prepends the collected style registry to the page body, so
 * it arrives as the first child of the hydration root. It is transport, not
 * application markup, and must not cost the app in-place hydration.
 */
describe('ssr style registry carrier', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
    for (const carried of Array.from(
      document.head.querySelectorAll('style[data-askr-style-registry]')
    )) {
      carried.remove();
    }
  });

  it('should adopt the server-rendered tree in place when a style carrier precedes it', async () => {
    let bump!: () => void;

    function App() {
      const label = state('ready');
      bump = () => label.set('updated');
      return (
        <div data-app-root={'true'}>
          <span data-app-label={'true'}>{label()}</span>
        </div>
      );
    }

    const { container, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    container.innerHTML = `<style data-askr-style-registry="true">.ak-x{color:red}</style>${renderToStringSync(
      () => <App />
    )}`;

    const serverRoot = container.querySelector('[data-app-root]')!;
    const serverLabel = container.querySelector('[data-app-label]')!;

    await hydrateSPA({
      root: container,
      registry: routeRegistryFromTable([{ path: '/', handler: App }]),
    });

    expect(container.querySelector('[data-app-root]')).toBe(serverRoot);
    expect(serverRoot.isConnected).toBe(true);
    expect(container.querySelector('[data-app-label]')).toBe(serverLabel);

    bump();
    flushScheduler();

    expect(container.querySelector('[data-app-label]')).toBe(serverLabel);
    expect(serverLabel.textContent).toBe('updated');
  });

  it('should keep the carried styles applied to the document', async () => {
    function App() {
      return <div data-app-root={'true'}>styled</div>;
    }

    const { container, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    container.innerHTML = `<style data-askr-style-registry="true">.ak-x{color:red}</style>${renderToStringSync(
      () => <App />
    )}`;

    await hydrateSPA({
      root: container,
      registry: routeRegistryFromTable([{ path: '/', handler: App }]),
    });

    const carried = document.querySelector(
      'style[data-askr-style-registry]'
    ) as HTMLStyleElement | null;
    expect(carried).not.toBeNull();
    expect(carried!.textContent).toContain('.ak-x{color:red}');
    // The carrier must leave the hydration root so it cannot perturb reconciliation.
    expect(
      container.querySelector('style[data-askr-style-registry]')
    ).toBeNull();
  });
});
