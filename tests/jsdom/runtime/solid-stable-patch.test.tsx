import { expect, test, vi } from 'vite-plus/test';
import { createDOMNode } from '../../../src/renderer/dom-internal';
import { tryPatchStableForDirtyItem } from '../../../src/renderer/stable-patch';
import { For } from '../../../src/control';
import { state, type State } from '../../../src';
import { getSignal } from '../../../src/resources';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

test('should retire a nested component when a dirty row replaces it with matching intrinsic output', () => {
  const { container, cleanup } = createTestContainer();
  let intrinsic!: State<boolean>;
  let signal!: AbortSignal;
  function Child() {
    signal = getSignal();
    return <span>child</span>;
  }
  function App() {
    intrinsic = state(false);
    const rows = state([1]);
    return (
      <For each={rows} by={(row) => row}>
        {() => <div>{intrinsic() ? <span>intrinsic</span> : <Child />}</div>}
      </For>
    );
  }
  try {
    createIsland({ root: container, component: App });
    flushScheduler();
    expect(signal.aborted).toBe(false);
    intrinsic.set(true);
    flushScheduler();
    expect(container.textContent).toBe('intrinsic');
    expect(signal.aborted).toBe(true);
  } finally {
    cleanup();
  }
});

test('should execute a component exactly once when a dirty intrinsic row falls back to synchronization', () => {
  const { container, cleanup } = createTestContainer();
  let phase!: State<number>;
  let executions = 0;
  function Child({ value }: { value: number }) {
    executions += 1;
    return <span>{value}</span>;
  }
  function App() {
    phase = state(0);
    const rows = state([1]);
    return (
      <For each={rows} by={(row) => row}>
        {() => {
          const value = phase();
          return (
            <div>{value ? <Child value={value} /> : <span>initial</span>}</div>
          );
        }}
      </For>
    );
  }
  try {
    createIsland({ root: container, component: App });
    flushScheduler();
    phase.set(1);
    flushScheduler();
    expect(executions).toBe(1);
    expect(container.textContent).toBe('1');
    phase.set(2);
    flushScheduler();
    expect(executions).toBe(2);
    expect(container.textContent).toBe('2');
  } finally {
    cleanup();
  }
});

test('should declining a stable patch leaves the existing attributes and text unchanged', () => {
  const dom = createDOMNode(
    <div title="before">
      old<span>tail</span>
    </div>
  ) as Element;
  const before = dom.outerHTML;
  const patched = tryPatchStableForDirtyItem({
    dom,
    vnode: (
      <div title="after">
        new<strong>tail</strong>
      </div>
    ),
  });
  expect(patched).toBe(false);
  expect(dom.outerHTML).toBe(before);
});

test('should roll back a supported intrinsic patch when a DOM property operation throws', () => {
  const { container, cleanup } = createTestContainer();
  let phase!: State<string>;
  const failure = new Error('DOM application failed');
  function App() {
    phase = state('initial');
    const rows = state([1]);
    return (
      <For each={rows} by={(row) => row}>
        {() => {
          const value = phase();
          return (
            <button data-phase={value} title={value}>
              {value}
            </button>
          );
        }}
      </For>
    );
  }
  try {
    createIsland({ root: container, component: App });
    flushScheduler();
    const button = container.querySelector('button');
    const before = container.innerHTML;
    const setAttribute = button!.setAttribute;
    const applying = vi
      .spyOn(button!, 'setAttribute')
      .mockImplementation(function (name, value) {
        if (name === 'title' && value === 'broken') throw failure;
        setAttribute.call(this, name, value);
      });
    phase.set('broken');
    expect(() => flushScheduler()).toThrow(failure);
    expect(container.innerHTML).toBe(before);
    expect(container.querySelector('button')).toBe(button);
    phase.set('recovered');
    flushScheduler();
    expect(button?.textContent).toBe('recovered');
    expect(button?.title).toBe('recovered');
    applying.mockRestore();
  } finally {
    cleanup();
  }
});

test('should decline components and incompatible descendants without refs or component execution', () => {
  const callback = vi.fn();
  const Component = vi.fn(() => <span>component</span>);
  const dom = createDOMNode(
    <div>
      <span>old</span>
    </div>
  ) as Element;
  expect(
    tryPatchStableForDirtyItem({
      dom,
      vnode: (
        <div ref={callback}>
          <strong>new</strong>
        </div>
      ),
    })
  ).toBe(false);
  expect(tryPatchStableForDirtyItem({ dom, vnode: <Component /> })).toBe(false);
  expect(Component).not.toHaveBeenCalled();
  expect(callback).not.toHaveBeenCalled();
});
