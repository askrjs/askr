import { afterEach, describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src';
import { Case, For, Match, Show } from '../../../src/control';
import { task } from '../../../src/resources';
import { renderToStringSync } from '../../../src/ssr';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

/**
 * A component whose result is text, a fragment, or a chain to either occupies
 * an anchored range among its parent's children. A control boundary beside it
 * shares the same parent child list, so parent re-renders and boundary toggles
 * must step over that range rather than remove it or treat it as their own.
 */

/** Markup without range anchors or the renderers' key bookkeeping attributes. */
function markup(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/ data-(?:key|askr-key-kind)="[^"]*"/g, '');
}

function Txt(props: { v: string }) {
  return props.v;
}

function Chain(props: { v: string }) {
  return <Txt v={props.v} />;
}

function Frag(props: { v: string }) {
  return (
    <>
      {props.v}
      <b>{props.v}</b>
    </>
  );
}

const components = { text: Txt, chain: Chain, fragment: Frag } as const;

function boundary(kind: 'Show' | 'For' | 'Case', on: boolean) {
  if (kind === 'Show') return <Show when={on}>{'S'}</Show>;
  if (kind === 'For')
    return (
      <For each={on ? ['x', 'y'] : []} by={(item) => item}>
        {(item) => <u>{item}</u>}
      </For>
    );
  return (
    <Case>
      <Match when={on}>{'C'}</Match>
    </Case>
  );
}

describe('component ranges beside control boundaries', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  describe.each(['Show', 'For', 'Case'] as const)('%s', (kind) => {
    it.each(Object.keys(components) as Array<keyof typeof components>)(
      'should keep %s component ranges intact while the boundary toggles',
      (componentKind) => {
        const Component = components[componentKind];
        const layout = (on: boolean, v: string) => (
          <main>
            <Component v={v} />
            {boundary(kind, on)}
            <Component v={v} />
            <i>{'tail'}</i>
          </main>
        );
        let setOn!: (value: boolean) => void;
        let setV!: (value: string) => void;
        function App() {
          const on = state(false);
          const v = state('A');
          setOn = on.set;
          setV = v.set;
          return layout(on(), v());
        }

        const { container, cleanup } = createTestContainer();
        cleanups.push(cleanup);
        createIsland({ root: container, component: App });
        flushScheduler();

        const steps: Array<[boolean, string]> = [
          [true, 'A'],
          [true, 'B'],
          [false, 'B'],
          [false, 'C'],
          [true, 'C'],
          [true, 'D'],
        ];
        for (const [on, v] of steps) {
          setOn(on);
          setV(v);
          flushScheduler();
          expect(markup(container.innerHTML)).toBe(
            markup(renderToStringSync(() => layout(on, v)))
          );
        }
      }
    );
  });

  describe.each(['Show', 'For'] as const)('stateful sibling of %s', (kind) => {
    it.each(['text', 'chain', 'fragment'] as const)(
      'should keep a %s result component instance across parent renders',
      (shape) => {
        let mounts = 0;
        let cleanupsRun = 0;
        let bump!: () => void;
        function Counter() {
          const count = state(0);
          bump = () => count.set(count() + 1);
          task(() => {
            mounts += 1;
            return () => {
              cleanupsRun += 1;
            };
          });
          const value = `count ${count()}`;
          return shape === 'fragment' ? (
            <>
              {value}
              <b>{'!'}</b>
            </>
          ) : (
            value
          );
        }
        function Inner() {
          return <Counter />;
        }
        let tick!: ReturnType<typeof state<number>>;
        function App() {
          tick = state(0);
          return (
            <main>
              <b>{tick()}</b>
              {shape === 'chain' ? <Inner /> : <Counter />}
              {boundary(kind, tick() > 100)}
              <i>{'tail'}</i>
            </main>
          );
        }

        const { container, cleanup } = createTestContainer();
        cleanups.push(cleanup);
        createIsland({ root: container, component: App });
        flushScheduler();
        bump();
        flushScheduler();
        expect(container.textContent).toContain('count 1');

        for (let round = 1; round <= 3; round += 1) {
          tick.set(round);
          flushScheduler();
          expect(container.textContent).toContain('count 1');
        }
        expect(mounts).toBe(1);
        expect(cleanupsRun).toBe(0);
      }
    );
  });
});
