import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src';
import { createSPA, hydrateSPA } from '../../../src/boot';
import { renderToStringSync } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { routeRegistryFromTable } from '../../router-test-utils';

type Cell = ReturnType<typeof state<string>>;

const cells = new Set<Cell>();
let label: Cell;

function Body(props: { label: string }) {
  const local = state('x');
  cells.add(local);
  return (
    <span>
      {local()}
      {props.label}
    </span>
  );
}

function FragmentWrapper(props: { label: string }) {
  return (
    <>
      <Body label={props.label} />
    </>
  );
}

function KeyedFragmentWrapper(props: { label: string }) {
  return (
    <>
      <Body key="a" label={props.label} />
      <Body key="b" label={props.label} />
    </>
  );
}

function KeyedElementWrapper(props: { label: string }) {
  return (
    <section>
      <Body key="a" label={props.label} />
      <Body key="b" label={props.label} />
    </section>
  );
}

function UnkeyedPage() {
  label = state('1');
  return (
    <div>
      <FragmentWrapper label={label()} />
    </div>
  );
}

function KeyedFragmentPage() {
  label = state('1');
  return (
    <div>
      <KeyedFragmentWrapper label={label()} />
    </div>
  );
}

function KeyedElementPage() {
  label = state('1');
  return (
    <div>
      <KeyedElementWrapper label={label()} />
    </div>
  );
}

describe('component returning a fragment keeps its child components after boot', () => {
  const cleanups: Array<() => void> = [];

  beforeEach(() => {
    cells.clear();
  });

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  async function boot(
    mode: 'hydrate' | 'spa',
    Page: () => unknown
  ): Promise<{ container: HTMLElement; serverHosts: Element[] }> {
    const { container, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    if (mode === 'hydrate') {
      container.innerHTML = renderToStringSync(() => <Page />);
    }
    const serverHosts = Array.from(container.querySelectorAll('span'));
    cells.clear();
    await (mode === 'hydrate' ? hydrateSPA : createSPA)({
      root: container,
      registry: routeRegistryFromTable([{ path: '/', handler: Page }]),
    });
    flushScheduler();
    return { container, serverHosts };
  }

  function expectChildrenRetained(container: HTMLElement, count: number): void {
    const hosts = Array.from(container.querySelectorAll('span'));
    expect(hosts.map((host) => host.textContent)).toEqual(
      Array(count).fill('x1')
    );

    for (const cell of cells) cell.set('y');
    flushScheduler();
    expect(hosts.map((host) => host.textContent)).toEqual(
      Array(count).fill('y1')
    );

    label.set('2');
    flushScheduler();

    const after = Array.from(container.querySelectorAll('span'));
    expect(after.map((host) => host.textContent)).toEqual(
      Array(count).fill('y2')
    );
    for (let i = 0; i < count; i++) expect(after[i]).toBe(hosts[i]);
  }

  it('should keep a hydrated unkeyed child of a fragment-returning component', async () => {
    const { container, serverHosts } = await boot('hydrate', UnkeyedPage);
    expect(Array.from(container.querySelectorAll('span'))).toEqual(serverHosts);
    expectChildrenRetained(container, 1);
  });

  it('should keep hydrated keyed children of a fragment-returning component', async () => {
    const { container, serverHosts } = await boot('hydrate', KeyedFragmentPage);
    expect(Array.from(container.querySelectorAll('span'))).toEqual(serverHosts);
    expectChildrenRetained(container, 2);
  });

  it('should keep hydrated keyed children of a component whose result is an element', async () => {
    const { container, serverHosts } = await boot('hydrate', KeyedElementPage);
    expect(Array.from(container.querySelectorAll('span'))).toEqual(serverHosts);
    expectChildrenRetained(container, 2);
  });

  it('should keep keyed children of a fragment-returning component in a client-rendered route', async () => {
    const { container } = await boot('spa', KeyedFragmentPage);
    expectChildrenRetained(container, 2);
  });
});
