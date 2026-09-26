import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import {
  DefaultPortal,
  Portal,
  _resetDefaultPortal,
  definePortal,
} from '../../../src/foundations/structures/portal';
import { resource, task, watch } from '../../../src/runtime/operations';
import { state, type State } from '../../../src/runtime/reactivity/state';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('portal content lifetime', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    _resetDefaultPortal();
  });

  afterEach(() => {
    cleanup();
    _resetDefaultPortal();
  });

  for (const named of [false, true]) {
    for (const writerFirst of [false, true]) {
      it(`should retire ${named ? 'named' : 'default'} content when the writer is removed (${writerFirst ? 'writer' : 'host'} first)`, () => {
        const channel = definePortal();
        let shown!: State<boolean>;
        let starts = 0;
        let stops = 0;

        function Content() {
          task(() => {
            starts += 1;
            return () => {
              stops += 1;
            };
          });
          return (
            <>
              <span data-portal-content={'true'}>{'content'}</span>
              <em data-portal-fragment={'true'}>{'fragment'}</em>
            </>
          );
        }

        function Writer() {
          return named ? (
            (channel.render({ children: <Content /> }) as null)
          ) : (
            <Portal>
              <Content />
            </Portal>
          );
        }

        function App() {
          shown = state(true);
          const Host = channel;
          const writer = shown() ? <Writer /> : null;
          const host = named ? <Host /> : <DefaultPortal />;
          return (
            <main>
              {writerFirst ? (
                <>
                  {writer}
                  {host}
                </>
              ) : (
                <>
                  {host}
                  {writer}
                </>
              )}
            </main>
          );
        }

        createIsland({ root: container, component: App });
        flushScheduler();
        expect(
          container.querySelectorAll('[data-portal-content]')
        ).toHaveLength(1);
        expect(
          container.querySelectorAll('[data-portal-fragment]')
        ).toHaveLength(1);
        expect(starts).toBe(1);

        shown.set(false);
        flushScheduler();
        expect(
          container.querySelectorAll('[data-portal-content]')
        ).toHaveLength(0);
        expect(
          container.querySelectorAll('[data-portal-fragment]')
        ).toHaveLength(0);
        expect(stops).toBe(1);
      });
    }
  }

  it('should retire named content when its host leaves before its writer', () => {
    const Channel = definePortal();
    let hostShown!: State<boolean>;
    let writerShown!: State<boolean>;
    let starts = 0;
    let stops = 0;

    function Content() {
      task(() => {
        starts += 1;
        return () => {
          stops += 1;
        };
      });
      return <span data-portal-content={'true'}>{'content'}</span>;
    }

    function Writer() {
      return Channel.render({ children: <Content /> }) as null;
    }

    function App() {
      hostShown = state(true);
      writerShown = state(true);
      return (
        <main>
          {hostShown() ? <Channel /> : null}
          {writerShown() ? <Writer /> : null}
        </main>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(starts).toBe(1);
    hostShown.set(false);
    flushScheduler();
    expect(container.querySelector('[data-portal-content]')).toBeNull();
    expect(stops).toBe(1);

    writerShown.set(false);
    flushScheduler();
    expect(stops).toBe(1);
  });

  it('should not let a departing named writer clear its replacement', () => {
    const Channel = definePortal();
    let replacement!: State<boolean>;
    let firstStops = 0;

    function FirstContent() {
      task(() => () => {
        firstStops += 1;
      });
      return <span data-portal-content={'first'}>{'first'}</span>;
    }

    function FirstWriter() {
      return Channel.render({ children: <FirstContent /> }) as null;
    }

    function SecondWriter() {
      return Channel.render({
        children: <span data-portal-content={'second'}>{'second'}</span>,
      }) as null;
    }

    function App() {
      replacement = state(false);
      return (
        <main>
          <Channel />
          {replacement() ? <SecondWriter /> : <FirstWriter />}
        </main>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();
    replacement.set(true);
    flushScheduler();
    expect(container.querySelector('[data-portal-content]')?.textContent).toBe(
      'second'
    );
    expect(firstStops).toBe(1);
  });

  it('should stop a portaled watch and abort its resource when the writer leaves', () => {
    let shown!: State<boolean>;
    let count!: State<number>;
    let signal!: AbortSignal;
    const observations: number[] = [];

    function Content(props: { count: State<number> }) {
      watch(props.count, (value) => observations.push(value));
      resource(({ signal: ownedSignal }) => {
        signal = ownedSignal;
        return new Promise<string>(() => {});
      }, []);
      return <span data-portal-content={'true'}>{'content'}</span>;
    }

    function App() {
      shown = state(true);
      count = state(0);
      return (
        <main>
          <DefaultPortal />
          {shown() ? (
            <Portal>
              <Content count={count} />
            </Portal>
          ) : null}
        </main>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(observations).toEqual([0]);
    expect(signal.aborted).toBe(false);
    shown.set(false);
    flushScheduler();
    expect(signal.aborted).toBe(true);
    count.set(1);
    flushScheduler();
    expect(observations).toEqual([0]);
  });

  it('should keep the previous named content alive after a failed replacement render', () => {
    const Channel = definePortal();
    let replacement!: State<boolean>;
    let stops = 0;

    function OldContent() {
      task(() => () => {
        stops += 1;
      });
      return <span data-portal-content={'old'}>{'old'}</span>;
    }

    function OldWriter() {
      return Channel.render({ children: <OldContent /> }) as null;
    }

    function NewWriter() {
      return Channel.render({
        children: <span data-portal-content={'new'}>{'new'}</span>,
      }) as null;
    }

    function Failure(props: { active: boolean }) {
      if (props.active) throw new Error('replacement failed');
      return null;
    }

    function App() {
      replacement = state(false);
      return (
        <main>
          <Channel />
          {replacement() ? <NewWriter /> : <OldWriter />}
          <Failure active={replacement()} />
        </main>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();
    replacement.set(true);
    expect(() => flushScheduler()).toThrow('replacement failed');
    expect(container.querySelector('[data-portal-content]')?.textContent).toBe(
      'old'
    );
    expect(stops).toBe(0);
  });
});
