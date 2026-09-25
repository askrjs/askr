import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { state, type State } from '../../../src/index';
import { ErrorBoundary } from '@askrjs/askr/components';
import { scheduleEventHandler } from '../../../src/fx';
import {
  disableEventDelegation,
  enableEventDelegation,
} from '../../../src/renderer/props/events';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

// Handler errors are reported like native listener errors (reportError), and
// reactive prop binding errors reach the owning ErrorBoundary, in every build.
describe.each(['development', 'production'])(
  'renderer handler and binding errors (%s)',
  (nodeEnv) => {
    let container: HTMLElement;
    let cleanup: () => void;
    let previousNodeEnv: string | undefined;
    let reportError: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = nodeEnv;
      reportError = vi.fn();
      vi.stubGlobal('reportError', reportError);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      ({ container, cleanup } = createTestContainer());
    });

    afterEach(() => {
      cleanup();
      enableEventDelegation();
      process.env.NODE_ENV = previousNodeEnv;
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    function mountThrowingHandler() {
      const error = new Error('handler failed');
      const outerClicks = vi.fn();
      const App = () => (
        <div onClick={outerClicks}>
          <button
            id="btn"
            onClick={() => {
              throw error;
            }}
          >
            boom
          </button>
        </div>
      );

      createIsland({ root: container, component: App });
      flushScheduler();
      container.querySelector<HTMLButtonElement>('#btn')!.click();
      flushScheduler();
      return { error, outerClicks };
    }

    it('should report delegated handler errors through reportError', () => {
      const { error, outerClicks } = mountThrowingHandler();

      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledWith(error);
      expect(outerClicks).toHaveBeenCalledTimes(1);
    });

    it('should report direct listener errors through reportError', () => {
      disableEventDelegation();
      const { error, outerClicks } = mountThrowingHandler();

      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledWith(error);
      expect(outerClicks).toHaveBeenCalledTimes(1);
    });

    it('should report scheduleEventHandler errors through reportError', () => {
      const error = new Error('scheduled failed');
      const button = document.createElement('button');
      container.appendChild(button);
      button.addEventListener(
        'click',
        scheduleEventHandler(() => {
          throw error;
        })
      );

      button.click();

      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledWith(error);
    });

    it('should route reactive prop binding errors to the owning ErrorBoundary', () => {
      let broken!: State<boolean>;
      const onError = vi.fn();

      const Child = () => {
        broken = state(false);
        return (
          <div
            id="bound"
            title={() => {
              if (broken()) throw new Error('binding failed');
              return 'ok';
            }}
          />
        );
      };

      const App = () => (
        <ErrorBoundary onError={onError}>
          <Child />
        </ErrorBoundary>
      );

      createIsland({ root: container, component: App });
      flushScheduler();
      expect(container.querySelector('#bound')!.getAttribute('title')).toBe(
        'ok'
      );

      broken.set(true);
      flushScheduler();

      expect(onError).toHaveBeenCalledTimes(1);
      expect((onError.mock.calls[0][0] as Error).message).toBe(
        'binding failed'
      );
      expect(
        container.querySelector('[data-askr-error-boundary]')
      ).toBeTruthy();
    });

    it('should surface reactive prop binding errors without a boundary', () => {
      let broken!: State<boolean>;

      const App = () => {
        broken = state(false);
        return (
          <div
            title={() => {
              if (broken()) throw new Error('binding failed');
              return 'ok';
            }}
          />
        );
      };

      createIsland({ root: container, component: App });
      flushScheduler();

      expect(() => {
        broken.set(true);
        flushScheduler();
      }).toThrow('binding failed');
    });
  }
);
