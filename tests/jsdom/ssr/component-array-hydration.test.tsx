import { afterEach, describe, expect, it } from 'vite-plus/test';
import { defineScope, readScope, state } from '../../../src';
import { hydrateSPA } from '../../../src/boot';
import { definePortal } from '../../../src/foundations/structures/portal';
import { renderToStringSync } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { routeRegistryFromTable } from '../../router-test-utils';

describe('component array hydration', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) {
      cleanups.pop()?.();
    }
  });

  it('should hydrate defineScope children and a portal host without a visible context wrapper', async () => {
    const DialogContext = defineScope('closed');
    const DialogPortal = definePortal();
    let update!: () => void;
    let close!: () => void;
    let reopen!: () => void;

    function DialogLabel() {
      return <span data-dialog-label={'true'}>{readScope(DialogContext)}</span>;
    }

    function DialogPortalWriter(props: { open: boolean }) {
      const value = readScope(DialogContext);
      DialogPortal.render({
        children: props.open ? (
          <aside data-dialog-portal={'true'}>{value}</aside>
        ) : null,
      });
      return null;
    }

    function DialogRoot() {
      const value = state('ready');
      const open = state(true);
      update = () => value.set('updated');
      close = () => open.set(false);
      reopen = () => open.set(true);
      return (
        <DialogContext value={value()}>
          <button data-dialog-trigger={'true'}>Open</button>
          <DialogLabel />
          <DialogPortalWriter open={open()} />
          <DialogPortal key={'dialog-root-portal'} />
        </DialogContext>
      );
    }

    function App() {
      return (
        <nav data-mobile-bar={'true'}>
          <DialogRoot />
          <strong>tail</strong>
        </nav>
      );
    }

    const { container, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    container.innerHTML = renderToStringSync(() => <App />);
    const mobileBar = container.querySelector('[data-mobile-bar]')!;

    expect(Array.from(mobileBar.children, (child) => child.tagName)).toEqual([
      'BUTTON',
      'SPAN',
      'ASIDE',
      'STRONG',
    ]);

    await hydrateSPA({
      root: container,
      registry: routeRegistryFromTable([{ path: '/', handler: App }]),
    });

    expect(container.querySelector('[data-mobile-bar]')).toBe(mobileBar);
    expect(Array.from(mobileBar.children, (child) => child.tagName)).toEqual([
      'BUTTON',
      'SPAN',
      'ASIDE',
      'STRONG',
    ]);
    expect(
      mobileBar.querySelector(':scope > div[data-key="Symbol(AskrContext)"]')
    ).toBeNull();

    const trigger = mobileBar.querySelector(
      '[data-dialog-trigger]'
    ) as HTMLButtonElement;
    const label = mobileBar.querySelector('[data-dialog-label]');
    const portal = mobileBar.querySelector('[data-dialog-portal]');
    trigger.focus();
    update();
    flushScheduler();

    expect(mobileBar.querySelector('[data-dialog-trigger]')).toBe(trigger);
    expect(mobileBar.querySelector('[data-dialog-label]')).toBe(label);
    expect(mobileBar.querySelector('[data-dialog-portal]')).toBe(portal);
    expect(document.activeElement).toBe(trigger);
    expect(mobileBar.querySelector('[data-dialog-label]')?.textContent).toBe(
      'updated'
    );
    expect(mobileBar.querySelector('[data-dialog-portal]')?.textContent).toBe(
      'updated'
    );
    expect(Array.from(mobileBar.children, (child) => child.tagName)).toEqual([
      'BUTTON',
      'SPAN',
      'ASIDE',
      'STRONG',
    ]);

    close();
    flushScheduler();

    expect(mobileBar.querySelector('[data-dialog-trigger]')).toBe(trigger);
    expect(mobileBar.querySelector('[data-dialog-label]')).toBe(label);
    expect(mobileBar.querySelector('[data-dialog-portal]')).toBeNull();
    expect(portal?.isConnected).toBe(false);

    reopen();
    flushScheduler();

    expect(mobileBar.querySelector('[data-dialog-trigger]')).toBe(trigger);
    expect(mobileBar.querySelector('[data-dialog-label]')).toBe(label);
    expect(mobileBar.querySelector('[data-dialog-portal]')?.textContent).toBe(
      'updated'
    );
    expect(Array.from(mobileBar.children, (child) => child.tagName)).toEqual([
      'BUTTON',
      'SPAN',
      'ASIDE',
      'STRONG',
    ]);
  });
});
