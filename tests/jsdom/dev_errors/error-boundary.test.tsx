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
import { Portal } from '../../../src/foundations/structures/portal';
import { getSignal, resource, task } from '../../../src/resources';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

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
