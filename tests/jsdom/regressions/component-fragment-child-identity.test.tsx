import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src/index';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

type Cell = ReturnType<typeof state<string>>;

// A stateful child: its local state starts at 'x' and it renders
// `${local}${props.label}`. Every mounted instance registers its cell.
const cells = new Set<Cell>();

function Body(props: { label: string }) {
  const local = state('x');
  cells.add(local);
  return (
    <span>
      {local()}
      {props.label}
    </span>
  );
}

function Tag(props: { label: string }) {
  const local = state('x');
  cells.add(local);
  return (
    <i>
      {local()}
      {props.label}
    </i>
  );
}

function FragmentWrapper(props: { label: string }) {
  return (
    <>
      <Body label={props.label} />
    </>
  );
}

function KeyedFragmentWrapper(props: { label: string }) {
  return (
    <>
      <Body key="a" label={props.label} />
      <Body key="b" label={props.label} />
    </>
  );
}

function NestedFragmentWrapper(props: { label: string }) {
  return (
    <>
      <>{[<Body key="a" label={props.label} />]}</>
      <>
        <Tag label={props.label} />
      </>
    </>
  );
}

function MixedFragmentWrapper(props: { label: string }) {
  return (
    <>
      <b>{props.label}</b>
      <Body label={props.label} />
      <Tag label={props.label} />
    </>
  );
}

function KeyedElementWrapper(props: { label: string }) {
  return (
    <section>
      <Body key="a" label={props.label} />
      <Body key="b" label={props.label} />
    </section>
  );
}

describe('component returning a fragment keeps its child components', () => {
  let container: HTMLElement;
  let cleanup: () => void;
  let label: ReturnType<typeof state<string>>;

  beforeEach(() => {
    cells.clear();
    const ctx = createTestContainer();
    container = ctx.container;
    cleanup = ctx.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  /**
   * Mount, set every child's local state to 'y', then change the label the
   * parent passes down. The children must keep their state ('y', not a fresh
   * 'x') and their DOM nodes, and still receive the new label.
   */
  function expectChildrenRetained(App: () => unknown, count: number): void {
    createIsland({ root: container, component: App });
    flushScheduler();

    const hosts = Array.from(container.querySelectorAll('span, i'));
    expect(hosts).toHaveLength(count);
    expect(hosts.map((host) => host.textContent)).toEqual(
      Array(count).fill('x1')
    );

    for (const cell of cells) cell.set('y');
    flushScheduler();
    expect(hosts.map((host) => host.textContent)).toEqual(
      Array(count).fill('y1')
    );

    label.set('2');
    flushScheduler();

    const after = Array.from(container.querySelectorAll('span, i'));
    expect(after.map((host) => host.textContent)).toEqual(
      Array(count).fill('y2')
    );
    expect(after).toEqual(hosts);
    for (let i = 0; i < count; i++) expect(after[i]).toBe(hosts[i]);
  }

  it('should keep a stateful child of a root fragment when the root re-renders', () => {
    expectChildrenRetained(() => {
      label = state('1');
      return (
        <>
          <Body label={label()} />
        </>
      );
    }, 1);
  });

  it('should keep every component child of a root fragment beside intrinsic siblings', () => {
    expectChildrenRetained(() => {
      label = state('1');
      return (
        <>
          <div>{label()}</div>
          <Body label={label()} />
          <Tag label={label()} />
        </>
      );
    }, 2);
  });

  it('should keep a fragment-returning component at the root when its parent passes new props', () => {
    expectChildrenRetained(() => {
      label = state('1');
      return <FragmentWrapper label={label()} />;
    }, 1);
  });

  it('should keep a fragment-returning component inside a root fragment', () => {
    expectChildrenRetained(() => {
      label = state('1');
      return (
        <>
          <FragmentWrapper label={label()} />
        </>
      );
    }, 1);
  });

  it('should keep an unkeyed child of a fragment-returning component inside an element', () => {
    expectChildrenRetained(() => {
      label = state('1');
      return (
        <div>
          <FragmentWrapper label={label()} />
        </div>
      );
    }, 1);
  });

  it('should keep keyed children of a fragment-returning component when its parent passes new props', () => {
    expectChildrenRetained(() => {
      label = state('1');
      return (
        <div>
          <KeyedFragmentWrapper label={label()} />
        </div>
      );
    }, 2);
  });

  it('should keep keyed children of a fragment-returning component at the root', () => {
    expectChildrenRetained(() => {
      label = state('1');
      return <KeyedFragmentWrapper label={label()} />;
    }, 2);
  });

  it('should keep children of nested fragments and arrays in a component result', () => {
    expectChildrenRetained(() => {
      label = state('1');
      return (
        <div>
          <NestedFragmentWrapper label={label()} />
        </div>
      );
    }, 2);
  });

  it('should keep several component children of one fragment beside an element', () => {
    expectChildrenRetained(() => {
      label = state('1');
      return (
        <div>
          <MixedFragmentWrapper label={label()} />
        </div>
      );
    }, 2);
  });

  it('should keep keyed children of a component whose result is an element', () => {
    expectChildrenRetained(() => {
      label = state('1');
      return (
        <div>
          <KeyedElementWrapper label={label()} />
        </div>
      );
    }, 2);
  });
});
