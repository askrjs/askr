import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  derive,
  selector,
  state,
  type Derived,
  type Selector,
  type State,
} from '../../../src/core/api/state';
import {
  createRoot,
  type PreparedRender,
  type Root,
} from '../../../src/core/dom/root';
import {
  clearScheduler,
  flushSync,
} from '../../../src/core/reactive/scheduler';

let root: Root | undefined;

afterEach(() => {
  vi.restoreAllMocks();
  root?.dispose();
  root = undefined;
  clearScheduler();
});

function abortInsertion(container: Element, prepared: PreparedRender): void {
  const failure = new Error('structural placement failed');
  const insert = vi
    .spyOn(container, 'insertBefore')
    .mockImplementationOnce(() => {
      throw failure;
    });
  expect(() => prepared.commit()).toThrow(failure);
  expect(prepared.aborted).toBe(true);
  insert.mockRestore();
  flushSync();
}

describe('derived hook structural commit rollback', () => {
  it('should restore a derived closure and its committed dependencies before existing bindings run', () => {
    const container = document.createElement('div');
    let left!: State<number>;
    let right!: State<number>;
    let result!: Derived<string>;
    function Example(props: {
      useRight: boolean;
      prefix: string;
      extra?: boolean;
    }) {
      left = state(1);
      right = state(2);
      result = derive(
        () => `${props.prefix}:${props.useRight ? right() : left()}`
      );
      return (
        <>
          <span title={result}>{() => result()}</span>
          {props.extra ? <i>extra</i> : null}
        </>
      );
    }

    root = createRoot(container);
    root.render(<Example useRight={false} prefix="committed" />);
    flushSync();
    const span = container.querySelector('span')!;
    const getter = result;
    expect(span.textContent).toBe('committed:1');

    abortInsertion(
      container,
      root.prepare(<Example useRight={true} prefix="discarded" extra />)
    );

    expect(container.querySelector('span')).toBe(span);
    expect(span.textContent).toBe('committed:1');
    expect(span.title).toBe('committed:1');
    expect(result()).toBe('committed:1');
    expect(result).toBe(getter);
    expect(container.querySelector('i')).toBeNull();

    left.set(4);
    flushSync();
    expect(span.textContent).toBe('committed:4');
    expect(span.title).toBe('committed:4');
    right.set(5);
    flushSync();
    expect(span.textContent).toBe('committed:4');

    root.render(<Example useRight={true} prefix="accepted" extra />);
    flushSync();
    expect(span.textContent).toBe('accepted:5');
    expect(container.querySelector('i')?.textContent).toBe('extra');
    right.set(6);
    flushSync();
    expect(span.textContent).toBe('accepted:6');
  });

  it('should restore a selector source, comparator, cache, and committed dependencies', () => {
    const container = document.createElement('div');
    let left!: State<number>;
    let right!: State<number>;
    let selected!: Selector<number>;
    const absoluteEqual = (a: number, b: number) => Math.abs(a) === Math.abs(b);
    function Example(props: {
      useRight: boolean;
      equal: (a: number, b: number) => boolean;
      extra?: boolean;
    }) {
      left = state(1);
      right = state(2);
      selected = selector(
        () => (props.useRight ? right() : left()),
        props.equal
      );
      return (
        <>
          <span>{() => `${selected(1)}:${selected(-1)}:${selected(3)}`}</span>
          {props.extra ? <i>extra</i> : null}
        </>
      );
    }

    root = createRoot(container);
    root.render(<Example useRight={false} equal={Object.is} />);
    flushSync();
    const span = container.querySelector('span')!;
    const predicate = selected;
    expect(span.textContent).toBe('true:false:false');

    abortInsertion(
      container,
      root.prepare(<Example useRight={true} equal={absoluteEqual} extra />)
    );

    expect(container.querySelector('span')).toBe(span);
    expect(span.textContent).toBe('true:false:false');
    expect(selected(1)).toBe(true);
    expect(selected(-1)).toBe(false);
    expect(selected).toBe(predicate);

    left.set(-1);
    flushSync();
    expect(span.textContent).toBe('false:true:false');
    right.set(3);
    flushSync();
    expect(span.textContent).toBe('false:true:false');

    root.render(<Example useRight={true} equal={absoluteEqual} extra />);
    flushSync();
    expect(span.textContent).toBe('false:false:true');
    expect(container.querySelector('i')?.textContent).toBe('extra');
    right.set(-1);
    flushSync();
    expect(span.textContent).toBe('true:true:false');
  });

  it('should restore a changed selector comparator when the source function stays the same', () => {
    const container = document.createElement('div');
    let value!: State<number>;
    let selected!: Selector<number>;
    const absoluteEqual = (a: number, b: number) => Math.abs(a) === Math.abs(b);
    function Example(props: {
      equal: (a: number, b: number) => boolean;
      extra?: boolean;
    }) {
      value = state(1);
      selected = selector(value, props.equal);
      return (
        <>
          <span>{() => `${selected(1)}:${selected(-1)}`}</span>
          {props.extra ? <i>extra</i> : null}
        </>
      );
    }

    root = createRoot(container);
    root.render(<Example equal={Object.is} />);
    flushSync();
    abortInsertion(
      container,
      root.prepare(<Example equal={absoluteEqual} extra />)
    );

    expect(container.textContent).toBe('true:false');
    expect(selected(-1)).toBe(false);
    value.set(-1);
    flushSync();
    expect(container.textContent).toBe('false:true');
  });

  it('should restore comparator behavior for object candidates held by existing bindings', () => {
    const container = document.createElement('div');
    const first = { id: 1 };
    const sameId = { id: 1 };
    const byId = (a: typeof first, b: typeof first) => a.id === b.id;
    function Example(props: {
      equal: (a: typeof first, b: typeof first) => boolean;
      extra?: boolean;
    }) {
      const value = state(first);
      const selected = selector(value, props.equal);
      return (
        <>
          <span>{() => `${selected(first)}:${selected(sameId)}`}</span>
          {props.extra ? <i>extra</i> : null}
        </>
      );
    }

    root = createRoot(container);
    root.render(<Example equal={Object.is} />);
    flushSync();
    abortInsertion(container, root.prepare(<Example equal={byId} extra />));
    expect(container.textContent).toBe('true:false');

    root.render(<Example equal={byId} extra />);
    flushSync();
    expect(container.querySelector('span')?.textContent).toBe('true:true');
  });

  it.each(['derive', 'selector'] as const)(
    'should restore %s after its proposed computation throws during prepare',
    (kind) => {
      const container = document.createElement('div');
      let value!: State<number>;
      let read!: () => number | boolean;
      function Example(props: { fail?: boolean }) {
        value = state(1);
        const compute = () => {
          if (props.fail) throw new Error('proposed computation failed');
          return value();
        };
        if (kind === 'derive') {
          read = derive(compute);
        } else {
          const selected = selector(compute);
          read = () => selected(1);
        }
        return <span>{String(read())}</span>;
      }

      root = createRoot(container);
      root.render(<Example />);
      flushSync();
      const initial = kind === 'derive' ? 1 : true;
      expect(() => root!.prepare(<Example fail />)).toThrow(
        'proposed computation failed'
      );
      expect(read()).toBe(initial);
      flushSync();
      expect(container.textContent).toBe(String(initial));

      value.set(2);
      flushSync();
      expect(container.textContent).toBe(kind === 'derive' ? '2' : 'false');
    }
  );
});
