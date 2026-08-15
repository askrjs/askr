import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { state, type State } from '../../../src/index';
import { ErrorBoundary } from '@askrjs/askr/components';
import {
  DefaultPortal,
  Portal,
} from '../../../src/foundations/structures/portal';
import { getSignal, resource, task } from '../../../src/resources';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe('ErrorBoundary (DEV ERRORS)', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should render a visible fallback when a child throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const Broken = () => {
      throw new Error('fixture crash');
    };

    const App = () => (
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('[data-askr-error-boundary]')).toBeTruthy();
    expect(container.textContent).toContain('fixture crash');
    expect(errorSpy).toHaveBeenCalledWith(
      '[Askr] ErrorBoundary caught render error:',
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });

  it('should render array fallback content when a child throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const Broken = () => {
      throw new Error('fixture crash');
    };

    const App = () => (
      <ErrorBoundary
        fallback={[
          <p id="array-fallback-first" key="first">
            fallback
          </p>,
          <p id="array-fallback-second" key="second">
            content
          </p>,
        ]}
      >
        <Broken />
      </ErrorBoundary>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('#array-fallback-first')?.textContent).toBe(
      'fallback'
    );
    expect(container.querySelector('#array-fallback-second')?.textContent).toBe(
      'content'
    );

    errorSpy.mockRestore();
  });

  it('should render an imperative DOM-node fallback when a child throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fallbackNode = document.createElement('div');
    fallbackNode.id = 'imperative-fallback';
    fallbackNode.textContent = 'recovered';

    const Broken = () => {
      throw new Error('fixture crash');
    };

    const App = () => (
      <ErrorBoundary fallback={fallbackNode}>
        <Broken />
      </ErrorBoundary>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('#imperative-fallback')).toBe(fallbackNode);
    expect(container.textContent).toContain('recovered');

    errorSpy.mockRestore();
  });

  it('should invoke onError and recover when resetKey changes', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    let setShouldFail: ((next: boolean) => void) | null = null;

    const Broken = ({ fail }: { fail: boolean }) => {
      if (fail) {
        throw new Error('fixture crash');
      }

      return <p id="recovered">recovered</p>;
    };

    const App = () => {
      const shouldFail = state(true);
      setShouldFail = shouldFail.set;

      return (
        <ErrorBoundary
          resetKey={shouldFail()}
          onError={onError}
          fallback={(error, reset) => (
            <div>
              <p id="fallback">{String(error)}</p>
              <button
                id="reset"
                type="button"
                onClick={() => {
                  setShouldFail?.(false);
                  reset();
                }}
              >
                Reset
              </button>
            </div>
          )}
        >
          <Broken fail={shouldFail()} />
        </ErrorBoundary>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('#fallback')).toBeTruthy();
    expect(onError).toHaveBeenCalledTimes(1);

    const resetButton = container.querySelector('#reset') as HTMLButtonElement;
    resetButton?.click();
    flushScheduler();

    expect(container.querySelector('#recovered')).toBeTruthy();
    expect(container.querySelector('#fallback')).toBeFalsy();

    errorSpy.mockRestore();
  });

  it('should recover the parent boundary given a child render error when the child later becomes valid', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let setValid!: (valid: boolean) => void;

    const Child = ({ valid }: { valid: boolean }) => {
      if (!valid) throw new Error('temporarily invalid');
      return <p id="valid-child">valid child</p>;
    };

    const App = () => {
      const valid = state(false);
      setValid = valid.set;
      return (
        <ErrorBoundary
          resetKey={valid()}
          fallback={<p id="parent-fallback">invalid child</p>}
        >
          <Child valid={valid()} />
        </ErrorBoundary>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(container.querySelector('#parent-fallback')).not.toBeNull();

    setValid(true);
    flushScheduler();

    expect(container.querySelector('#parent-fallback')).toBeNull();
    expect(container.querySelector('#valid-child')?.textContent).toBe(
      'valid child'
    );
    errorSpy.mockRestore();
  });

  it('should keep the outer boundary healthy when an inner boundary handles the error', () => {
    const OuterFallback = () => <p id="outer-fallback">outer</p>;
    const InnerFallback = () => <p id="inner-fallback">inner</p>;

    const Broken = () => {
      throw new Error('inner crash');
    };

    const App = () => (
      <ErrorBoundary fallback={<OuterFallback />}>
        <ErrorBoundary fallback={<InnerFallback />}>
          <Broken />
        </ErrorBoundary>
      </ErrorBoundary>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('#inner-fallback')).toBeTruthy();
    expect(container.querySelector('#outer-fallback')).toBeFalsy();
  });

  it('should catch a descendant error after a resource resolves post-mount', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const deferred = createDeferred<string>();

    function ResourceRow() {
      const result = resource(() => deferred.promise, []);
      if (!result.pending && result.value === 'boom') {
        throw new Error('scheduled resource crash');
      }
      return <p id="resource-status">{result.pending ? 'loading' : 'ready'}</p>;
    }

    const App = () => (
      <ErrorBoundary
        fallback={<p id="resource-fallback">{'resource recovered'}</p>}
      >
        <ResourceRow />
      </ErrorBoundary>
    );

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(container.querySelector('#resource-status')?.textContent).toBe(
      'loading'
    );

    deferred.resolve('boom');
    await Promise.resolve();

    expect(() => flushScheduler()).not.toThrow();
    expect(container.querySelector('#resource-fallback')?.textContent).toBe(
      'resource recovered'
    );
    errorSpy.mockRestore();
  });

  it('should still propagate a scheduled descendant error without a boundary', () => {
    let setShouldFail!: (value: boolean) => void;

    function ScheduledFailure() {
      const shouldFail = state(false);
      setShouldFail = shouldFail.set;
      if (shouldFail()) {
        throw new Error('unhandled scheduled crash');
      }
      return <p>{'healthy'}</p>;
    }

    createIsland({ root: container, component: ScheduledFailure });
    flushScheduler();
    setShouldFail(true);

    expect(() => flushScheduler()).toThrow('unhandled scheduled crash');
  });

  it('should route portal materialization errors to the writer boundary', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function BrokenPortalContent() {
      throw new Error('portal writer crash');
    }

    function PortalWriter() {
      return (
        <Portal>
          <BrokenPortalContent />
        </Portal>
      );
    }

    const App = () => (
      <>
        <DefaultPortal />
        <ErrorBoundary
          fallback={<p id="portal-writer-fallback">{'writer recovered'}</p>}
        >
          <PortalWriter />
        </ErrorBoundary>
      </>
    );

    expect(() => {
      createIsland({ root: container, component: App });
      flushScheduler();
    }).not.toThrow();
    expect(
      container.querySelector('#portal-writer-fallback')?.textContent
    ).toBe('writer recovered');
    errorSpy.mockRestore();
  });

  it('should route portal materialization errors to a boundary around the host', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    function BrokenPortalContent() {
      throw new Error('portal host crash');
    }

    const App = () => (
      <>
        <Portal>
          <BrokenPortalContent />
        </Portal>
        <ErrorBoundary
          fallback={<p id="portal-host-fallback">{'host recovered'}</p>}
        >
          <DefaultPortal />
        </ErrorBoundary>
      </>
    );

    expect(() => {
      createIsland({ root: container, component: App });
      flushScheduler();
    }).not.toThrow();
    expect(container.querySelector('#portal-host-fallback')?.textContent).toBe(
      'host recovered'
    );
    errorSpy.mockRestore();
  });

  it('should route a post-mount portal update error to the writer boundary', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let setShouldFail!: (value: boolean) => void;

    function StatefulPortalContent() {
      const shouldFail = state(false);
      setShouldFail = shouldFail.set;
      if (shouldFail()) {
        throw new Error('post-mount portal crash');
      }
      return <p id="portal-healthy">{'healthy'}</p>;
    }

    function PortalWriter() {
      return (
        <Portal>
          <StatefulPortalContent />
        </Portal>
      );
    }

    const App = () => (
      <>
        <DefaultPortal />
        <ErrorBoundary
          fallback={<p id="portal-async-fallback">{'async recovered'}</p>}
        >
          <PortalWriter />
        </ErrorBoundary>
      </>
    );

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(container.querySelector('#portal-healthy')).not.toBeNull();

    setShouldFail(true);
    expect(() => flushScheduler()).not.toThrow();
    expect(container.querySelector('#portal-async-fallback')?.textContent).toBe(
      'async recovered'
    );
    errorSpy.mockRestore();
  });

  it('should still propagate portal content errors without a boundary', () => {
    function BrokenPortalContent() {
      throw new Error('unhandled portal crash');
    }

    const App = () => (
      <>
        <DefaultPortal />
        <Portal>
          <BrokenPortalContent />
        </Portal>
      </>
    );

    expect(() => {
      createIsland({ root: container, component: App });
      flushScheduler();
    }).toThrow('unhandled portal crash');
  });

  it('should discard provisional lifecycle work before committing a fallback', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let source!: State<number>;
    const refValues: Array<Element | null> = [];
    const loader = vi.fn(async () => 'loaded');
    const startTask = vi.fn();
    let renders = 0;
    let aborts = 0;

    function ProvisionalOwner() {
      renders += 1;
      source();
      getSignal().addEventListener('abort', () => {
        aborts += 1;
      });
      resource(loader, []);
      task(startTask);
      Portal({
        children: <aside data-failed-portal={'true'}>{'failed portal'}</aside>,
      });

      return (
        <button
          data-provisional={'true'}
          ref={(element) => {
            refValues.push(element);
          }}
        >
          {'provisional'}
        </button>
      );
    }

    function LaterFailure() {
      throw new Error('boundary sibling failed');
    }

    const App = () => {
      source = state(0);
      return (
        <ErrorBoundary
          fallback={<section data-fallback={'true'}>{'fallback'}</section>}
        >
          <ProvisionalOwner key={'provisional'} />
          <LaterFailure key={'failure'} />
        </ErrorBoundary>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    await Promise.resolve();
    await Promise.resolve();

    expect(container.querySelector('[data-fallback="true"]')).not.toBeNull();
    expect(container.querySelector('[data-provisional="true"]')).toBeNull();
    expect(container.querySelector('[data-failed-portal="true"]')).toBeNull();
    expect(refValues).toEqual([]);
    expect(loader).not.toHaveBeenCalled();
    expect(startTask).not.toHaveBeenCalled();
    expect(aborts).toBe(1);
    expect(renders).toBe(1);

    source.set(1);
    flushScheduler();
    expect(renders).toBe(1);

    errorSpy.mockRestore();
  });

  it('should discard a failed fallback attempt before an outer boundary recovers', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const refValues: Array<Element | null> = [];
    const loader = vi.fn(async () => 'loaded');
    const startTask = vi.fn();
    let aborts = 0;

    function FallbackProvisionalOwner() {
      getSignal().addEventListener('abort', () => {
        aborts += 1;
      });
      resource(loader, []);
      task(startTask);
      Portal({
        children: (
          <aside data-failed-fallback-portal={'true'}>
            {'failed fallback portal'}
          </aside>
        ),
      });
      return (
        <button
          ref={(element) => {
            refValues.push(element);
          }}
        >
          {'failed fallback owner'}
        </button>
      );
    }

    function PrimaryFailure() {
      throw new Error('inner primary failed');
    }

    function FallbackFailure() {
      throw new Error('inner fallback failed');
    }

    const App = () => (
      <ErrorBoundary
        fallback={
          <section data-outer-fallback={'true'}>{'outer fallback'}</section>
        }
      >
        <ErrorBoundary
          fallback={[
            <FallbackProvisionalOwner key={'provisional'} />,
            <FallbackFailure key={'failure'} />,
          ]}
        >
          <PrimaryFailure />
        </ErrorBoundary>
      </ErrorBoundary>
    );

    createIsland({ root: container, component: App });
    flushScheduler();
    await Promise.resolve();
    await Promise.resolve();

    expect(
      container.querySelector('[data-outer-fallback="true"]')
    ).not.toBeNull();
    expect(
      container.querySelector('[data-failed-fallback-portal="true"]')
    ).toBeNull();
    expect(refValues).toEqual([]);
    expect(loader).not.toHaveBeenCalled();
    expect(startTask).not.toHaveBeenCalled();
    expect(aborts).toBe(1);

    errorSpy.mockRestore();
  });
});
