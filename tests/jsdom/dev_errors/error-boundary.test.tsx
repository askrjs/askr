import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { ErrorBoundary, state } from '../../../src/index';
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
});
