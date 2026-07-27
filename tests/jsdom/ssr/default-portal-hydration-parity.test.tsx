import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { defineScope, readScope, state } from '../../../src';
import { hydrateSPA } from '../../../src/boot';
import {
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

describe('default portal hydration parity', () => {
  beforeEach(() => {
    _resetDefaultPortal();
  });

  afterEach(() => {
    _resetDefaultPortal();
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
