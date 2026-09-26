import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { defineScope, readScope, state } from '../../../src';
import { createSPA, hydrateSPA } from '../../../src/boot';
import {
  DefaultPortal,
  Portal,
  _resetDefaultPortal,
} from '../../../src/foundations/structures/portal';
import { renderToStringSync } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { routeRegistryFromTable } from '../../router-test-utils';
import { isSSRPortalHydrationAnchor } from '../../../src/common/portal';
import { captureServerHydrationMarkup } from '../../../src/ssr/verify-hydration';
import { getActiveRenderContext } from '../../../src/common/render-context';

describe('default portal hydration parity', () => {
  beforeEach(() => {
    _resetDefaultPortal();
  });

  afterEach(() => {
    _resetDefaultPortal();
  });

  it('should adopt an explicit host in place and verify portal markup', async () => {
    const Page = () => (
      <main data-page={'true'}>
        <DefaultPortal />
        <Portal>
          <button data-portal-action={'true'}>{'act'}</button>
        </Portal>
        <span data-tail={'true'}>{'tail'}</span>
      </main>
    );
    const { container, cleanup } = createTestContainer();
    const registry = routeRegistryFromTable([{ path: '/', handler: Page }]);

    try {
      container.innerHTML = renderToStringSync(Page);
      const page = container.querySelector('[data-page]');
      const button = container.querySelector('[data-portal-action]');
      const tail = container.querySelector('[data-tail]');
      expect(page?.querySelector('[data-portal-action]')).toBe(button);
      expect(button?.nextElementSibling).toBe(tail);
      expect(captureServerHydrationMarkup(container, '/')).not.toBeNull();

      await hydrateSPA({
        root: container,
        registry,
        hydrate: { verifyMarkup: true },
      });
      flushScheduler();

      expect(container.querySelector('[data-page]')).toBe(page);
      expect(container.querySelector('[data-portal-action]')).toBe(button);
      expect(button?.parentElement).toBe(page);
      expect(button?.nextElementSibling).toBe(tail);
      expect(container.querySelector('[data-tail]')).toBe(tail);
    } finally {
      cleanup();
    }
  });

  it('should adopt multiple explicit portal nodes without consuming the following sibling', async () => {
    const Page = () => (
      <main>
        <DefaultPortal />
        <Portal>
          <button data-first={'true'}>{'first'}</button>
          <strong data-second={'true'}>{'second'}</strong>
        </Portal>
        <span data-tail={'true'}>{'tail'}</span>
      </main>
    );
    const { container, cleanup } = createTestContainer();
    const registry = routeRegistryFromTable([{ path: '/', handler: Page }]);

    try {
      container.innerHTML = renderToStringSync(Page);
      const first = container.querySelector('[data-first]');
      const second = container.querySelector('[data-second]');
      const tail = container.querySelector('[data-tail]');

      await hydrateSPA({
        root: container,
        registry,
        hydrate: { verifyMarkup: true },
      });
      flushScheduler();

      const main = container.querySelector('main');
      expect(main?.querySelector('[data-first]')).toBe(first);
      expect(main?.querySelector('[data-second]')).toBe(second);
      expect(first?.nextElementSibling).toBe(second);
      expect(second?.nextElementSibling).toBe(tail);
      expect(container.querySelector('[data-tail]')).toBe(tail);
    } finally {
      cleanup();
    }
  });

  it('should keep the following sibling when the explicit portal has no writer', async () => {
    const Page = () => (
      <main>
        <DefaultPortal />
        <span data-tail={'true'}>{'tail'}</span>
      </main>
    );
    const { container, cleanup } = createTestContainer();
    const registry = routeRegistryFromTable([{ path: '/', handler: Page }]);

    try {
      container.innerHTML = renderToStringSync(Page);
      const tail = container.querySelector('[data-tail]');
      await hydrateSPA({
        root: container,
        registry,
        hydrate: { verifyMarkup: true },
      });
      flushScheduler();

      expect(container.querySelector('[data-tail]')).toBe(tail);
      expect(container.querySelector('main')?.textContent).toBe('tail');
    } finally {
      cleanup();
    }
  });

  it.each([true, false])(
    'should remove a server-only default portal writer (verifyMarkup=%s)',
    async (verifyMarkup) => {
      const Page = () => (
        <main>
          <DefaultPortal />
          {getActiveRenderContext() ? (
            <Portal>
              <span data-server-only>{'server only'}</span>
            </Portal>
          ) : null}
          <b data-tail>{'tail'}</b>
        </main>
      );
      const { container, cleanup } = createTestContainer();
      try {
        container.innerHTML = renderToStringSync(Page);
        expect(container.querySelector('[data-server-only]')).not.toBeNull();
        const hydration = hydrateSPA({
          root: container,
          registry: routeRegistryFromTable([{ path: '/', handler: Page }]),
          hydrate: { verifyMarkup },
        });
        if (verifyMarkup) {
          await expect(hydration).rejects.toThrow(/Hydration mismatch/i);
        } else {
          await hydration;
        }
        expect(container.querySelector('[data-server-only]')).toBeNull();
        expect(container.querySelector('[data-tail]')?.textContent).toBe(
          'tail'
        );
      } finally {
        cleanup();
      }
    }
  );

  it('should restore portal content when hydration rolls back and adopt it on retry', async () => {
    let failClient = true;
    let clicks = 0;
    const Guard = () => {
      if (!getActiveRenderContext() && failClient) {
        throw new Error('hydration failed');
      }
      return <b>{'ready'}</b>;
    };
    const Page = () => (
      <main>
        <DefaultPortal />
        <Portal>
          <button data-portal-retry onClick={() => (clicks += 1)}>
            {'retry'}
          </button>
        </Portal>
        <Guard />
      </main>
    );
    const { container, cleanup } = createTestContainer();
    const registry = routeRegistryFromTable([{ path: '/', handler: Page }]);

    try {
      container.innerHTML = renderToStringSync(Page);
      const serverButton = container.querySelector('[data-portal-retry]');
      await expect(hydrateSPA({ root: container, registry })).rejects.toThrow(
        'hydration failed'
      );
      expect(container.querySelector('[data-portal-retry]')).toBe(serverButton);

      failClient = false;
      await hydrateSPA({ root: container, registry });
      expect(container.querySelector('[data-portal-retry]')).toBe(serverButton);
      (serverButton as HTMLButtonElement).click();
      expect(clicks).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('should reject a portal content mismatch from the client renderer', async () => {
    const Page = () => (
      <main>
        <Portal>
          <span>{getActiveRenderContext() ? 'server' : 'client'}</span>
        </Portal>
        <DefaultPortal />
      </main>
    );
    const { container, cleanup } = createTestContainer();
    const registry = routeRegistryFromTable([{ path: '/', handler: Page }]);

    try {
      container.innerHTML = renderToStringSync(Page);
      expect(captureServerHydrationMarkup(container, '/')).not.toBeNull();
      await expect(
        hydrateSPA({
          root: container,
          registry,
          hydrate: { verifyMarkup: true },
        })
      ).rejects.toThrow(/Hydration mismatch/i);
    } finally {
      cleanup();
    }
  });

  it('should place an explicit host before its writer on a fresh client mount', async () => {
    const Page = () => (
      <main>
        <DefaultPortal />
        <Portal>
          <button data-portal-action={'true'}>{'act'}</button>
        </Portal>
        <span data-tail={'true'}>{'tail'}</span>
      </main>
    );
    const { container, cleanup } = createTestContainer();
    const registry = routeRegistryFromTable([{ path: '/', handler: Page }]);
    try {
      await createSPA({ root: container, registry });
      flushScheduler();
      const page = container.querySelector('main');
      const button = container.querySelector('[data-portal-action]');
      const tail = container.querySelector('[data-tail]');
      expect(button?.parentElement).toBe(page);
      expect(button?.nextElementSibling).toBe(tail);
    } finally {
      cleanup();
    }
  });

  it('should keep a closed nested-scope portal out of application topology', async () => {
    const SheetScope = defineScope('sheet');
    const LayerScope = defineScope('layer');
    let setOpen!: (open: boolean) => void;

    function SheetSurface(props: { open: boolean }) {
      if (!props.open) {
        return null;
      }
      return (
        <section data-sheet={'true'}>
          {`${readScope(SheetScope)}:${readScope(LayerScope)}`}
        </section>
      );
    }

    function SheetPortal(props: { open: boolean }) {
      return (
        <Portal>
          <SheetSurface open={props.open} />
        </Portal>
      );
    }

    function App() {
      const open = state(false);
      setOpen = open.set;
      return (
        <main data-page={'true'}>
          <SheetScope value={'docs-sheet'}>
            <LayerScope value={'docs-layer'}>
              <SheetPortal open={open()} />
              <span data-label={'true'}>{'Docs'}</span>
            </LayerScope>
          </SheetScope>
        </main>
      );
    }

    const { container, cleanup } = createTestContainer();
    const registry = routeRegistryFromTable([{ path: '/', handler: App }]);

    try {
      container.innerHTML = renderToStringSync(App);
      const page = container.querySelector('[data-page]');
      const label = container.querySelector('[data-label]');
      const serverElements = Array.from(container.children);
      const portalAnchor = page?.firstChild;
      const defaultPortalAnchor = container.lastChild;

      expect(serverElements).toEqual([page]);
      expect(isSSRPortalHydrationAnchor(portalAnchor)).toBe(true);
      expect(isSSRPortalHydrationAnchor(defaultPortalAnchor)).toBe(true);
      expect(
        isSSRPortalHydrationAnchor(document.createComment('user-owned'))
      ).toBe(false);
      expect(
        isSSRPortalHydrationAnchor(document.createComment('askr-portal:user'))
      ).toBe(false);
      expect(
        isSSRPortalHydrationAnchor(
          document.createComment('askr-portal-anchor:0-extra')
        )
      ).toBe(false);

      await hydrateSPA({ root: container, registry });
      flushScheduler();

      expect(container.querySelector('[data-page]')).toBe(page);
      expect(container.querySelector('[data-label]')).toBe(label);
      expect(page?.contains(portalAnchor ?? null)).toBe(true);
      expect(portalAnchor?.nextSibling).toBe(label);
      expect(container.querySelector('[data-sheet]')).toBeNull();
      expect(Array.from(container.children)).toEqual(serverElements);
      expect(container.childNodes).toHaveLength(2);
      expect(container.lastChild).toBeInstanceOf(Comment);
      expect(container.querySelectorAll(':scope > div')).toHaveLength(0);
      expect(page?.querySelectorAll(':scope > div')).toHaveLength(0);

      setOpen(true);
      flushScheduler();

      expect(container.querySelector('[data-page]')).toBe(page);
      expect(container.querySelector('[data-label]')).toBe(label);
      expect(page?.contains(portalAnchor ?? null)).toBe(true);
      expect(portalAnchor?.nextSibling).toBe(label);
      expect(container.querySelector('[data-sheet]')?.textContent).toBe(
        'docs-sheet:docs-layer'
      );

      setOpen(false);
      flushScheduler();

      expect(container.querySelector('[data-sheet]')).toBeNull();
      expect(Array.from(container.children)).toEqual(serverElements);
      expect(container.querySelector('[data-label]')).toBe(label);
      expect(page?.contains(portalAnchor ?? null)).toBe(true);
      expect(portalAnchor?.nextSibling).toBe(label);

      setOpen(true);
      flushScheduler();

      expect(container.querySelector('[data-sheet]')?.textContent).toBe(
        'docs-sheet:docs-layer'
      );
      expect(container.querySelector('[data-label]')).toBe(label);
      expect(page?.contains(portalAnchor ?? null)).toBe(true);
      expect(portalAnchor?.nextSibling).toBe(label);
    } finally {
      cleanup();
    }
  });
});
