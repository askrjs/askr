import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { state, type State } from '../../../src/index';
import { cleanupApp } from '../../../src/boot';
import { registerMountOperation } from '../../../src/runtime';
import {
  disableEventDelegation,
  enableEventDelegation,
} from '../../../src/renderer/props/events';
import {
  cleanupInstanceIfPresent,
  teardownNodeSubtree,
} from '../../../src/renderer/ownership/cleanup';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

// Renderer teardown (refs, listeners, reactive props, component lifetimes)
// drains every sibling and descendant before surfacing failures. Non-strict
// teardown reports them through reportError, the channel used for event
// handler errors, in every build; strict teardown throws them to its caller.
describe.each(['development', 'production'])(
  'renderer teardown error reporting (%s)',
  (nodeEnv) => {
    let container: HTMLElement;
    let cleanup: () => void;
    let previousNodeEnv: string | undefined;
    let reportError: ReturnType<typeof vi.fn>;
    let warn: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = nodeEnv;
      reportError = vi.fn();
      vi.stubGlobal('reportError', reportError);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      ({ container, cleanup } = createTestContainer());
    });

    afterEach(() => {
      cleanup();
      enableEventDelegation();
      process.env.NODE_ENV = previousNodeEnv;
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    function throwingRef(error: Error) {
      return (element: Element | null) => {
        if (element === null) throw error;
      };
    }

    function mountToggle(render: () => unknown, cleanupStrict = false) {
      let show!: State<boolean>;
      const App = () => {
        show = state(true);
        return <main>{show() ? render() : null}</main>;
      };
      createIsland({ root: container, component: App, cleanupStrict });
      flushScheduler();
      return () => {
        show.set(false);
        flushScheduler();
      };
    }

    it('should report a throwing ref cleanup after sibling refs are cleared', () => {
      const error = new Error('ref cleanup failed');
      const sibling = vi.fn();
      const remove = mountToggle(() => (
        <section>
          <i ref={throwingRef(error)} />
          <b ref={sibling} />
        </section>
      ));

      remove();

      expect(container.querySelector('section')).toBeNull();
      expect(sibling).toHaveBeenLastCalledWith(null);
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledWith(error);
    });

    it('should report a throwing listener cleanup and keep draining the subtree', () => {
      disableEventDelegation();
      const error = new Error('listener cleanup failed');
      const sibling = vi.fn();
      const remove = mountToggle(() => (
        <section>
          <button id="btn" onClick={() => {}} />
          <b ref={sibling} />
        </section>
      ));
      const button = container.querySelector('#btn')!;
      button.removeEventListener = () => {
        throw error;
      };

      remove();

      expect(container.querySelector('section')).toBeNull();
      expect(sibling).toHaveBeenLastCalledWith(null);
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledWith(error);
    });

    it('should report a failing component cleanup and still dispose its siblings', () => {
      const error = new Error('component cleanup failed');
      const siblingCleanup = vi.fn();
      const Failing = () => {
        registerMountOperation(() => () => {
          throw error;
        });
        return <p>failing</p>;
      };
      const Sibling = () => {
        registerMountOperation(() => siblingCleanup);
        return <p>sibling</p>;
      };
      const remove = mountToggle(
        () => (
          <section>
            <Failing />
            <Sibling />
          </section>
        ),
        true
      );

      remove();

      expect(siblingCleanup).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledTimes(1);
      const reported = reportError.mock.calls[0]![0] as AggregateError;
      expect(reported).toBeInstanceOf(AggregateError);
      expect(reported.errors).toEqual([error]);
    });

    it('should aggregate several sibling failures into one report', () => {
      const first = new Error('first ref cleanup failed');
      const second = new Error('second ref cleanup failed');
      const sibling = vi.fn();
      const remove = mountToggle(() => (
        <section>
          <i ref={throwingRef(first)} />
          <b ref={sibling} />
          <u ref={throwingRef(second)} />
        </section>
      ));

      remove();

      expect(sibling).toHaveBeenLastCalledWith(null);
      expect(reportError).toHaveBeenCalledTimes(1);
      const reported = reportError.mock.calls[0]![0] as AggregateError;
      expect(reported).toBeInstanceOf(AggregateError);
      expect(reported.errors).toEqual([first, second]);
    });

    it('should not route teardown failures through development-only warnings', () => {
      const error = new Error('ref cleanup failed');
      const remove = mountToggle(() => <i ref={throwingRef(error)} />);

      remove();

      expect(reportError).toHaveBeenCalledWith(error);
      expect(warn).not.toHaveBeenCalledWith(expect.any(String), error);
    });

    it('should report failures from a direct non-strict teardownNodeSubtree call', () => {
      const first = new Error('first');
      const second = new Error('second');
      const sibling = vi.fn();
      mountToggle(() => (
        <section>
          <i ref={throwingRef(first)} />
          <b ref={sibling} />
          <u ref={throwingRef(second)} />
        </section>
      ));
      const section = container.querySelector('section')!;

      expect(() => teardownNodeSubtree(section)).not.toThrow();

      expect(sibling).toHaveBeenLastCalledWith(null);
      expect(reportError).toHaveBeenCalledTimes(1);
      expect((reportError.mock.calls[0]![0] as AggregateError).errors).toEqual([
        first,
        second,
      ]);
    });

    it('should throw every failure from strict teardownNodeSubtree without reporting', () => {
      const first = new Error('first');
      const second = new Error('second');
      const sibling = vi.fn();
      mountToggle(() => (
        <section>
          <i ref={throwingRef(first)} />
          <b ref={sibling} />
          <u ref={throwingRef(second)} />
        </section>
      ));
      const section = container.querySelector('section')!;

      let thrown: unknown;
      try {
        teardownNodeSubtree(section, { strict: true });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AggregateError);
      expect((thrown as AggregateError).errors).toEqual([first, second]);
      expect(sibling).toHaveBeenLastCalledWith(null);
      expect(reportError).not.toHaveBeenCalled();
    });

    it('should report failures from a non-strict cleanupInstanceIfPresent call', () => {
      const error = new Error('component cleanup failed');
      const siblingCleanup = vi.fn();
      const Failing = () => {
        registerMountOperation(() => () => {
          throw error;
        });
        return <p>failing</p>;
      };
      const Sibling = () => {
        registerMountOperation(() => siblingCleanup);
        return <p>sibling</p>;
      };
      mountToggle(
        () => (
          <section>
            <Failing />
            <Sibling />
          </section>
        ),
        true
      );
      const section = container.querySelector('section')!;

      expect(() => cleanupInstanceIfPresent(section)).not.toThrow();

      expect(siblingCleanup).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledTimes(1);
      expect((reportError.mock.calls[0]![0] as AggregateError).errors).toEqual([
        error,
      ]);
    });

    it('should report teardown failures when a non-strict island is cleaned up', () => {
      const error = new Error('ref cleanup failed');
      const sibling = vi.fn();
      mountToggle(() => (
        <section>
          <i ref={throwingRef(error)} />
          <b ref={sibling} />
        </section>
      ));

      expect(() => cleanupApp(container)).not.toThrow();

      expect(sibling).toHaveBeenLastCalledWith(null);
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reportError).toHaveBeenCalledWith(error);
    });

    it('should throw descendant teardown failures from a strict island cleanup', () => {
      const refError = new Error('ref cleanup failed');
      const componentError = new Error('component cleanup failed');
      const siblingCleanup = vi.fn();
      const Failing = () => {
        registerMountOperation(() => () => {
          throw componentError;
        });
        return <i ref={throwingRef(refError)} />;
      };
      const Sibling = () => {
        registerMountOperation(() => siblingCleanup);
        return <p>sibling</p>;
      };
      mountToggle(
        () => (
          <section>
            <Failing />
            <Sibling />
          </section>
        ),
        true
      );

      let thrown: unknown;
      try {
        cleanupApp(container);
      } catch (error) {
        thrown = error;
      }

      expect(siblingCleanup).toHaveBeenCalledTimes(1);
      expect(reportError).not.toHaveBeenCalled();
      expect(thrown).toBeInstanceOf(AggregateError);
      const leaves: unknown[] = [];
      const collect = (value: unknown): void => {
        if (value instanceof AggregateError) value.errors.forEach(collect);
        else leaves.push(value);
      };
      collect(thrown);
      expect(leaves).toContain(refError);
      expect(leaves).toContain(componentError);
    });
  }
);
