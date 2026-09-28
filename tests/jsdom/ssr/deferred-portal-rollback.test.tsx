import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import { state } from '../../../src/index';
import {
  DefaultPortal,
  Portal,
  _resetDefaultPortal,
} from '../../../src/foundations/structures/portal';
import { renderToString } from '../../../src/ssr';
import { routeRegistryFromTable } from '../../router-test-utils';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('deferred portal rollback', () => {
  let container: HTMLDivElement;
  let cleanup: () => void;

  beforeEach(() => ({ container, cleanup } = createTestContainer()));

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    _resetDefaultPortal();
  });

  it('should restore held portal nodes when deferred placement mutates then fails', async () => {
    const originalRect = Element.prototype.getBoundingClientRect;
    let expanded!: ReturnType<typeof state<boolean>>;
    const Component = () => {
      expanded = state(false);
      return (
        <main>
          <div class="portal-boundary">
            <Portal>
              <button id="portal-first">first</button>
              {expanded() ? <button id="portal-second">second</button> : null}
            </Portal>
          </div>
          <DefaultPortal />
        </main>
      );
    };
    const registry = routeRegistryFromTable([
      { path: '/', handler: Component },
    ]);

    Element.prototype.getBoundingClientRect = function () {
      return (this as Element).className === 'portal-boundary'
        ? ({ top: 1000 } as DOMRect)
        : ({ top: 0 } as DOMRect);
    };

    try {
      container.innerHTML = renderToString({ url: '/', registry });
      await hydrateSPA({
        root: container,
        registry,
        hydrate: { deferBelowFold: true, foldThreshold: 100 },
      });
      flushScheduler();
      const first = container.querySelector('#portal-first');
      expect(first).not.toBeNull();
      expect(
        container
          .querySelector('.portal-boundary')
          ?.hasAttribute('data-skip-hydrate')
      ).toBe(true);

      expanded.set(true);
      flushScheduler();
      const portalHost = container.querySelector('main')!;
      const insertBefore = portalHost.insertBefore.bind(portalHost);
      const failure = new Error('deferred portal insertion failed');
      let didFail = false;
      vi.spyOn(portalHost, 'insertBefore').mockImplementation(
        (node, before) => {
          const inserted = insertBefore(node, before);
          if ((node as Element).id === 'portal-second' && !didFail) {
            didFail = true;
            throw failure;
          }
          return inserted;
        }
      );

      Element.prototype.getBoundingClientRect = function () {
        return { top: 0 } as DOMRect;
      };
      window.dispatchEvent(new Event('scroll'));
      flushScheduler();
      expect(didFail).toBe(true);
      expect(
        container
          .querySelector('.portal-boundary')
          ?.hasAttribute('data-skip-hydrate')
      ).toBe(false);

      expect(container.querySelector('#portal-first')).toBe(first);
      expect(container.querySelector('#portal-second')).toBeNull();
    } finally {
      Element.prototype.getBoundingClientRect = originalRect;
    }
  });

  it('should restore removed portal nodes when deferred removal mutates then fails', async () => {
    const originalRect = Element.prototype.getBoundingClientRect;
    let expanded!: ReturnType<typeof state<boolean>>;
    const Component = () => {
      expanded = state(true);
      return (
        <main>
          <div class="portal-boundary">
            <Portal>
              <button id="portal-first">first</button>
              {expanded() ? <button id="portal-second">second</button> : null}
            </Portal>
          </div>
          <DefaultPortal />
        </main>
      );
    };
    const registry = routeRegistryFromTable([
      { path: '/', handler: Component },
    ]);

    Element.prototype.getBoundingClientRect = function () {
      return (this as Element).className === 'portal-boundary'
        ? ({ top: 1000 } as DOMRect)
        : ({ top: 0 } as DOMRect);
    };

    try {
      container.innerHTML = renderToString({ url: '/', registry });
      await hydrateSPA({
        root: container,
        registry,
        hydrate: { deferBelowFold: true, foldThreshold: 100 },
      });
      flushScheduler();
      const first = container.querySelector('#portal-first');
      const second = container.querySelector('#portal-second');
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      expect(
        container
          .querySelector('.portal-boundary')
          ?.hasAttribute('data-skip-hydrate')
      ).toBe(true);

      expanded.set(false);
      flushScheduler();
      const portalHost = container.querySelector('main')!;
      const removeChild = portalHost.removeChild.bind(portalHost);
      let didFail = false;
      vi.spyOn(portalHost, 'removeChild').mockImplementation((node) => {
        const removed = removeChild(node);
        if (node === second && !didFail) {
          didFail = true;
          throw new Error('deferred portal removal failed');
        }
        return removed;
      });

      Element.prototype.getBoundingClientRect = function () {
        return { top: 0 } as DOMRect;
      };
      window.dispatchEvent(new Event('scroll'));
      flushScheduler();

      expect(didFail).toBe(true);
      expect(
        container
          .querySelector('.portal-boundary')
          ?.hasAttribute('data-skip-hydrate')
      ).toBe(false);
      expect(container.querySelector('#portal-first')).toBe(first);
      expect(container.querySelector('#portal-second')).toBe(second);
    } finally {
      Element.prototype.getBoundingClientRect = originalRect;
    }
  });
});
