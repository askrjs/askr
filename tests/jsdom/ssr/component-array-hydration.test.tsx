import { afterEach, describe, expect, it } from 'vite-plus/test';
import { For } from '../../../src/control';
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

  it('should mount one portal child given a wrapped empty server host when the parent refreshes before opening', async () => {
    const DialogContext = defineScope<{
      open: boolean;
      setOpen(nextOpen: boolean): void;
    } | null>(null);
    const DialogPortal = definePortal();
    let refresh!: () => void;

    function DialogTrigger() {
      const dialog = readScope(DialogContext);
      return (
        <button
          data-dialog-trigger={'true'}
          onClick={() => dialog?.setOpen(true)}
        >
          Open
        </button>
      );
    }

    function DialogContent() {
      const dialog = readScope(DialogContext);
      return dialog?.open ? <aside data-dialog-portal={'true'} /> : null;
    }

    function DialogPortalWriter() {
      readScope(DialogContext);
      DialogPortal.render({
        children: <DialogContent />,
      });
      return null;
    }

    function DialogRoot() {
      const openState = state(false);
      return (
        <DialogContext value={{ open: openState(), setOpen: openState.set }}>
          <DialogTrigger />
          <DialogPortalWriter />
          <DialogPortal key={'dialog-root-portal'} />
        </DialogContext>
      );
    }

    function AlertDialog() {
      return <DialogRoot />;
    }

    function App() {
      const version = state(0);
      refresh = () => version.set(version() + 1);
      return (
        <main data-version={version()}>
          <AlertDialog />
        </main>
      );
    }

    const { container, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    container.innerHTML = renderToStringSync(App);

    expect(container.querySelectorAll('[data-dialog-portal]')).toHaveLength(0);

    await hydrateSPA({
      root: container,
      registry: routeRegistryFromTable([{ path: '/', handler: App }]),
    });

    refresh();
    flushScheduler();
    (
      container.querySelector('[data-dialog-trigger]') as HTMLButtonElement
    ).click();
    flushScheduler();

    expect(container.querySelectorAll('[data-dialog-portal]')).toHaveLength(1);
  });

  it('should preserve nested scope, keyed row, and portal identities during hydration', async () => {
    const Scope = defineScope('initial');
    const Portal = definePortal();
    const initialRows = ['one', 'two', 'three'];
    let setLabel!: (value: string) => void;
    let setRows!: (value: string[]) => void;

    function StaticLink() {
      return <a data-static={'true'}>{readScope(Scope)}</a>;
    }

    function Row(props: { name: string }) {
      return <a data-row={props.name}>{`${props.name}:${readScope(Scope)}`}</a>;
    }

    function PortalWriter() {
      Portal.render({
        children: <aside data-portal={'true'}>{readScope(Scope)}</aside>,
      });
      return null;
    }

    function App() {
      const label = state('initial');
      const rows = state(initialRows);
      setLabel = label.set;
      setRows = rows.set;
      return (
        <nav>
          <Scope value={label()}>
            <StaticLink />
            <For each={rows} by={(name) => name}>
              {(name) => <Row key={name} name={name} />}
            </For>
            <PortalWriter />
            <Portal key={'component-array-portal'} />
          </Scope>
          <strong>tail</strong>
        </nav>
      );
    }

    const { container, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    container.innerHTML = renderToStringSync(App);
    const nav = container.querySelector('nav')!;
    const staticLink = nav.querySelector('[data-static]');
    const rowNodes = new Map(
      Array.from(nav.querySelectorAll('[data-row]'), (row) => [
        row.getAttribute('data-row'),
        row,
      ])
    );
    const portal = nav.querySelector('[data-portal]');

    await hydrateSPA({
      root: container,
      registry: routeRegistryFromTable([{ path: '/', handler: App }]),
    });

    expect.soft(nav.querySelector('[data-static]')).toBe(staticLink);
    for (const [name, row] of rowNodes) {
      expect.soft(nav.querySelector(`[data-row="${name}"]`)).toBe(row);
    }
    expect.soft(nav.querySelector('[data-portal]')).toBe(portal);
    expect(nav.querySelector('div[data-key="Symbol(AskrContext)"]')).toBeNull();

    setLabel('updated');
    setRows(['three', 'one']);
    flushScheduler();

    expect(nav.querySelector('[data-static]')).toBe(staticLink);
    expect(nav.querySelector('[data-static]')?.textContent).toBe('updated');
    expect(
      Array.from(nav.querySelectorAll('[data-row]'), (row) =>
        row.getAttribute('data-row')
      )
    ).toEqual(['three', 'one']);
    expect(nav.querySelector('[data-row="three"]')).toBe(rowNodes.get('three'));
    expect(nav.querySelector('[data-row="one"]')).toBe(rowNodes.get('one'));
    expect(nav.querySelector('[data-row="three"]')?.textContent).toBe(
      'three:updated'
    );
    expect(nav.querySelector('[data-portal]')).toBe(portal);
    expect(nav.querySelector('[data-portal]')?.textContent).toBe('updated');
    expect(Array.from(nav.children, (child) => child.tagName)).toEqual([
      'A',
      'A',
      'A',
      'ASIDE',
      'STRONG',
    ]);
  });

  it('should keep sibling scope providers distinct during hydration and updates', async () => {
    const LeftScope = defineScope('left-default');
    const RightScope = defineScope('right-default');
    const leftIdentity = (
      LeftScope({ value: 'left' }).props as Record<string, unknown>
    )['__askrIdentityKey'];
    const rightIdentity = (
      RightScope({ value: 'right' }).props as Record<string, unknown>
    )['__askrIdentityKey'];
    let updateLeft!: () => void;
    let updateRight!: () => void;

    expect(typeof leftIdentity).toBe('number');
    expect(typeof rightIdentity).toBe('number');
    expect(leftIdentity).not.toBe(rightIdentity);

    function LeftLabel() {
      return <span data-left={'true'}>{readScope(LeftScope)}</span>;
    }

    function RightLabel() {
      return <span data-right={'true'}>{readScope(RightScope)}</span>;
    }

    function App() {
      const left = state('left');
      const right = state('right');
      updateLeft = () => left.set('left-updated');
      updateRight = () => right.set('right-updated');
      return (
        <nav>
          <LeftScope value={left()}>
            <LeftLabel />
          </LeftScope>
          <RightScope value={right()}>
            <RightLabel />
          </RightScope>
          <strong>tail</strong>
        </nav>
      );
    }

    const { container, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    container.innerHTML = renderToStringSync(App);
    const nav = container.querySelector('nav')!;
    const leftLabel = nav.querySelector('[data-left]');
    const rightLabel = nav.querySelector('[data-right]');

    await hydrateSPA({
      root: container,
      registry: routeRegistryFromTable([{ path: '/', handler: App }]),
    });

    expect.soft(nav.querySelector('[data-left]')).toBe(leftLabel);
    expect.soft(nav.querySelector('[data-right]')).toBe(rightLabel);

    updateLeft();
    flushScheduler();

    expect(nav.querySelector('[data-left]')).toBe(leftLabel);
    expect(nav.querySelector('[data-left]')?.textContent).toBe('left-updated');
    expect(nav.querySelector('[data-right]')).toBe(rightLabel);
    expect(nav.querySelector('[data-right]')?.textContent).toBe('right');

    updateRight();
    flushScheduler();

    expect(nav.querySelector('[data-left]')).toBe(leftLabel);
    expect(nav.querySelector('[data-left]')?.textContent).toBe('left-updated');
    expect(nav.querySelector('[data-right]')).toBe(rightLabel);
    expect(nav.querySelector('[data-right]')?.textContent).toBe(
      'right-updated'
    );
  });
});
