import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { cleanupApp, createSPA } from '../../../src/boot';
import { navigate } from '../../../src/router/navigate';
import {
  createRouteRegistry,
  currentAuth,
  route,
} from '../../../src/router/route';
import { currentOwner, onDispose } from '../../../src/core/api/hooks';
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

  it('should preserve a navigation started synchronously from a destination ref', async () => {
    let redirected = false;
    route('/a', () => <p>A</p>);
    route('/b', () => (
      <p
        ref={(element) => {
          if (element && !redirected) {
            redirected = true;
            navigate('/c');
          }
        }}
      >
        B
      </p>
    ));
    route('/c', () => <p>C</p>);
    route('/d', () => <p>D</p>);
    const second = createTestContainer();
    try {
      const registry = currentRouteRegistry();
      await createSPA({ root: container, registry });
      await createSPA({ root: second.container, registry });
      await settle();

      navigate('/b');
      await settle();

      expect(window.location.pathname).toBe('/c');
      expect(container.textContent).toBe('C');
      expect(second.container.textContent).toBe('C');

      navigate('/d');
      await settle();
      expect(window.location.pathname).toBe('/d');
      expect(container.textContent).toBe('D');
      expect(second.container.textContent).toBe('D');
    } finally {
      second.cleanup();
    }
  });

  it('should not publish to a root cleaned up by an earlier destination ref', async () => {
    const second = createTestContainer();
    let removed = false;
    route('/a', () => <p>A</p>);
    route('/b', () => (
      <p
        ref={(element) => {
          if (element && !removed) {
            removed = true;
            cleanupApp(second.container);
          }
        }}
      >
        B
      </p>
    ));
    try {
      const registry = currentRouteRegistry();
      await createSPA({ root: container, registry });
      await createSPA({ root: second.container, registry });
      await settle();

      navigate('/b');
      await settle();

      expect(container.textContent).toBe('B');
      expect(second.container.textContent).toBe('');
    } finally {
      cleanupApp(second.container);
      second.cleanup();
    }
  });

  it('should not let a stale navigation publish later roots after reentry', async () => {
    const second = createTestContainer();
    const third = createTestContainer();
    let redirected = false;
    route('/a', () => <p>A</p>);
    route('/b', () => (
      <p
        ref={(element) => {
          if (element && second.container.contains(element) && !redirected) {
            redirected = true;
            navigate('/c');
          }
        }}
      >
        B
      </p>
    ));
    route('/c', () => <p>C</p>);
    try {
      const registry = currentRouteRegistry();
      await createSPA({ root: container, registry });
      await createSPA({ root: second.container, registry });
      await createSPA({ root: third.container, registry });
      await settle();

      navigate('/b');
      await settle();

      expect(window.location.pathname).toBe('/c');
      expect(container.textContent).toBe('C');
      expect(second.container.textContent).toBe('C');
      expect(third.container.textContent).toBe('C');
    } finally {
      second.cleanup();
      third.cleanup();
    }
  });

  it('should stop publishing stale destinations to later roots after first-root ref reentry', async () => {
    const second = createTestContainer();
    const third = createTestContainer();
    let redirected = false;
    let staleThirdRootMounts = 0;
    route('/a', () => <p>A</p>);
    route('/b', () => (
      <p
        ref={(element) => {
          if (element && container.contains(element) && !redirected) {
            redirected = true;
            navigate('/c');
          }
          if (element && third.container.contains(element)) {
            staleThirdRootMounts += 1;
          }
        }}
      >
        B
      </p>
    ));
    route('/c', () => <p>C</p>);
    try {
      const registry = currentRouteRegistry();
      await createSPA({ root: container, registry });
      await createSPA({ root: second.container, registry });
      await createSPA({ root: third.container, registry });
      await settle();

      navigate('/b');
      await settle();

      expect(staleThirdRootMounts).toBe(0);
      expect(window.location.pathname).toBe('/c');
      expect(container.textContent).toBe('C');
      expect(second.container.textContent).toBe('C');
      expect(third.container.textContent).toBe('C');
    } finally {
      second.cleanup();
      third.cleanup();
    }
  });

  it('should discard earlier prepared roots when a later root fails during render', async () => {
    const second = createTestContainer();
    let destinationRenders = 0;
    let provisionalCleanups = 0;
    const renderFailure = new Error('second destination render failed');
    route('/a', () => <p>A</p>);
    route('/b', () => {
      destinationRenders += 1;
      if (destinationRenders === 1) {
        onDispose(currentOwner()!, () => {
          provisionalCleanups += 1;
        });
        return <p>B</p>;
      }
      throw renderFailure;
    });
    try {
      const registry = currentRouteRegistry();
      await createSPA({ root: container, registry });
      await createSPA({ root: second.container, registry });
      await settle();

      expect(() => navigate('/b')).toThrow(renderFailure);

      expect(destinationRenders).toBe(2);
      expect(provisionalCleanups).toBe(1);
      expect(container.textContent).toBe('A');
      expect(second.container.textContent).toBe('A');
      expect(window.location.pathname).toBe('/a');
    } finally {
      second.cleanup();
    }
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

  it('should preserve navigation started by provisional cleanup during rollback', async () => {
    const second = createTestContainer();
    const writeFailure = new Error('insert failed');
    let redirected = false;
    route('/a', () => <p>A</p>);
    route('/b', () => {
      onDispose(currentOwner()!, () => {
        if (!redirected) {
          redirected = true;
          navigate('/c');
        }
      });
      return <p>B</p>;
    });
    route('/c', () => <p>C</p>);
    try {
      const registry = currentRouteRegistry();
      await createSPA({ root: container, registry });
      await createSPA({ root: second.container, registry });
      await settle();
      failNextInsertInto(second.container, writeFailure);

      expect(() => navigate('/b')).toThrow(writeFailure);
      await settle();

      expect(window.location.pathname).toBe('/c');
      expect(container.textContent).toBe('C');
      expect(second.container.textContent).toBe('C');
    } finally {
      second.cleanup();
    }
  });

  it('should keep departing auth visible to DOM callbacks until all roots apply', async () => {
    const second = createTestContainer();
    const identity = (id: string) => ({
      authenticated: true,
      principal: { id, subject: id },
      session: null,
      tenant: null,
      scopes: [],
    });
    const observed: (string | undefined)[] = [];
    const tag = `askr-auth-observer-${Math.random().toString(36).slice(2)}`;
    customElements.define(
      tag,
      class extends HTMLElement {
        connectedCallback() {
          observed.push(currentAuth().principal?.id);
        }
      }
    );
    const registry = createRouteRegistry(
      () => {
        route('/a', () => <p>A</p>);
        route('/b', () => (
          <>
            <p>B</p>
            <askr-auth-observer />
          </>
        ));
      },
      {
        auth: {
          resolve: ({ pathname }) =>
            identity(pathname === '/a' ? 'alice' : 'bob'),
        },
      }
    );
    try {
      await createSPA({ root: container, registry });
      await createSPA({ root: second.container, registry });
      await settle();
      observed.length = 0;
      const writeFailure = new Error('second root insert failed');
      failNextInsertInto(second.container, writeFailure);

      expect(() => navigate('/b')).toThrow(writeFailure);
      vi.mocked(Element.prototype.insertBefore).mockRestore();
      await settle();

      expect(observed).not.toContain('bob');
      expect(currentAuth().principal?.id).toBe('alice');
      expect(container.textContent).toBe('A');
      expect(second.container.textContent).toBe('A');
    } finally {
      second.cleanup();
    }
  });
});
