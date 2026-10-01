import { afterEach, describe, expect, it } from 'vite-plus/test';
import { onRouteChange } from '../../../src/router';
import { createRoot, type Root } from '../../../src/core/dom/root';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('route-change callbacks and prepared renders', () => {
  let root: Root | undefined;
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    root?.dispose();
    root = undefined;
    cleanup?.();
    cleanup = undefined;
    flushScheduler();
    window.history.replaceState({}, '', '/');
  });

  function setup() {
    const test = createTestContainer();
    cleanup = test.cleanup;
    root = createRoot(test.container);
    return root;
  }

  it.each([true, false])(
    'should retain a committed initial callback when a later prepare is discarded (immediate: %s)',
    (immediate) => {
      const events: string[] = [];
      const Page = ({
        label,
        immediate,
      }: {
        label: string;
        immediate: boolean;
      }) => {
        onRouteChange(
          (current, previous) => {
            events.push(
              `${label}:${previous?.path ?? 'none'}->${current.path}`
            );
            return () => events.push(`cleanup:${label}`);
          },
          { immediate }
        );
        return <main>{label}</main>;
      };
      const root = setup();
      window.history.replaceState({}, '', '/committed');
      root.render(<Page label="committed" immediate={immediate} />);
      window.history.replaceState({}, '', '/discarded');
      const prepared = root.prepare(
        <Page label="discarded" immediate={!immediate} />
      );
      expect(prepared.discard()).toEqual([]);
      window.history.replaceState({}, '', '/committed');

      flushScheduler();

      expect(events).toEqual(immediate ? ['committed:none->/committed'] : []);
      root.dispose();
      expect(events).toEqual(
        immediate ? ['committed:none->/committed', 'cleanup:committed'] : []
      );
    }
  );

  it('should run a pending committed route change with its own callback and snapshot', () => {
    const events: string[] = [];
    const Page = ({ label }: { label: string }) => {
      onRouteChange(
        (current, previous) => {
          events.push(`${label}:${previous?.path ?? 'none'}->${current.path}`);
          return () => events.push(`cleanup:${label}`);
        },
        { immediate: true }
      );
      return <main>{label}</main>;
    };
    const root = setup();
    window.history.replaceState({}, '', '/initial');
    root.render(<Page label="initial" />);
    flushScheduler();
    window.history.replaceState({}, '', '/committed');
    root.render(<Page label="committed" />);
    window.history.replaceState({}, '', '/discarded');
    root.prepare(<Page label="discarded" />).discard();
    window.history.replaceState({}, '', '/committed');

    flushScheduler();

    expect(events).toEqual([
      'initial:none->/initial',
      'cleanup:initial',
      'committed:/initial->/committed',
    ]);
  });

  it('should observe each committed route when several commits precede the callback flush', () => {
    const events: string[] = [];
    const Page = ({ label }: { label: string }) => {
      onRouteChange(
        (current, previous) => {
          events.push(`${label}:${previous?.path ?? 'none'}->${current.path}`);
          return () => events.push(`cleanup:${label}`);
        },
        { immediate: true }
      );
      return <main>{label}</main>;
    };
    const root = setup();
    window.history.replaceState({}, '', '/first');
    root.render(<Page label="first" />);
    window.history.replaceState({}, '', '/second');
    root.render(<Page label="second" />);
    window.history.replaceState({}, '', '/first');
    root.render(<Page label="third" />);

    flushScheduler();

    expect(events).toEqual([
      'first:none->/first',
      'cleanup:first',
      'second:/first->/second',
      'cleanup:second',
      'third:/second->/first',
    ]);
  });

  it('should skip only the initial route by default and retain later committed transitions', () => {
    const events: string[] = [];
    const Page = ({ label }: { label: string }) => {
      onRouteChange((current, previous) => {
        events.push(`${label}:${previous?.path ?? 'none'}->${current.path}`);
      });
      return <main>{label}</main>;
    };
    const root = setup();
    window.history.replaceState({}, '', '/first');
    root.render(<Page label="initial" />);
    flushScheduler();
    window.history.replaceState({}, '', '/second');
    root.render(<Page label="second" />);
    window.history.replaceState({}, '', '/first');
    root.render(<Page label="third" />);
    root.render(<Page label="same-route" />);

    flushScheduler();

    expect(events).toEqual(['second:/first->/second', 'third:/second->/first']);
  });
});
