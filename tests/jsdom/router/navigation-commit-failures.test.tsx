import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { createSPA } from '../../../src/boot';
import { navigate } from '../../../src/router/navigate';
import { route } from '../../../src/router/route';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { currentRouteRegistry, resetRouteState } from '../../router-test-utils';

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
    flushScheduler();
  }
}

function failNextInsertInto(parent: Element, error: Error) {
  const insertBefore = Element.prototype.insertBefore;
  let armed = true;
  return vi
    .spyOn(Element.prototype, 'insertBefore')
    .mockImplementation(function <T extends Node>(
      this: Element,
      node: T,
      child: Node | null
    ): T {
      if (armed && this === parent) {
        armed = false;
        throw error;
      }
      return insertBefore.call(this, node, child) as T;
    });
}

describe('navigation commit failures', () => {
  let container: HTMLDivElement;
  let cleanup: () => void;
  let reported: unknown[];

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    reported = [];
    vi.stubGlobal('reportError', (error: unknown) => reported.push(error));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    window.history.replaceState({}, '', '/a');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    cleanup();
    window.history.replaceState({}, '', '/');
  });

  it('should finish navigating when the destination commit applied but a ref threw', async () => {
    const refFailure = new Error('ref failed');
    route('/a', () => <p>A</p>);
    route('/b', () => (
      <p
        ref={(el) => {
          if (el) throw refFailure;
        }}
      >
        B
      </p>
    ));
    await createSPA({ root: container, registry: currentRouteRegistry() });
    await settle();

    expect(() => navigate('/b')).not.toThrow();
    await settle();

    expect(container.textContent).toBe('B');
    expect(window.location.pathname).toBe('/b');
    expect(reported).toContain(refFailure);
  });

  it('should keep the previous page and location when the destination commit is aborted', async () => {
    const writeFailure = new Error('insert failed');
    route('/a', () => (
      <main id="shell">
        <p>A</p>
      </main>
    ));
    route('/b', () => (
      <main id="shell">
        <p>B</p>
      </main>
    ));
    await createSPA({ root: container, registry: currentRouteRegistry() });
    await settle();
    failNextInsertInto(container, writeFailure);
    expect(() => navigate('/b')).toThrow(writeFailure);
    await settle();
    vi.mocked(Element.prototype.insertBefore).mockRestore();

    expect(container.textContent).toBe('A');
    expect(window.location.pathname).toBe('/a');

    navigate('/b');
    await settle();
    expect(container.textContent).toBe('B');
    expect(window.location.pathname).toBe('/b');
  });
});
