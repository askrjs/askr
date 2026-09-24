import { expect, test } from 'vite-plus/test';
import { state, type State } from '../../../src';
import {
  getAppliedProps,
  recordAppliedProps,
} from '../../../src/renderer/props/attributes';
import { captureRootHost } from '../../../src/renderer/ownership/root-snapshot';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

function decorate(element: HTMLElement): void {
  element.setAttribute('aria-hidden', 'true');
  element.setAttribute('data-tooltip', 'external');
  element.setAttribute('inert', '');
  element.classList.add('ext');
  element.style.transform = 'scale(2)';
}

function expectDecorated(element: HTMLElement): void {
  expect({
    ariaHidden: element.getAttribute('aria-hidden'),
    tooltip: element.getAttribute('data-tooltip'),
    inert: element.hasAttribute('inert'),
    extClass: element.classList.contains('ext'),
    transform: element.style.transform,
  }).toEqual({
    ariaHidden: 'true',
    tooltip: 'external',
    inert: true,
    extClass: true,
    transform: 'scale(2)',
  });
}

test('should preserve third-party attributes, classes and styles on an unchanged node across parent renders', () => {
  const { container, cleanup } = createTestContainer();
  let count!: State<number>;
  function App() {
    count = state(0);
    return (
      <div data-count={count()}>
        <p>x</p>
      </div>
    );
  }
  try {
    createIsland({ root: container, component: App });
    flushScheduler();
    const paragraph = container.querySelector('p')!;
    decorate(paragraph);
    count.set(1);
    flushScheduler();
    expect(container.querySelector('div')!.getAttribute('data-count')).toBe(
      '1'
    );
    expect(container.querySelector('p')).toBe(paragraph);
    expectDecorated(paragraph);
  } finally {
    cleanup();
  }
});

test('should preserve third-party attributes, classes and styles on a node whose own props change', () => {
  const { container, cleanup } = createTestContainer();
  let count!: State<number>;
  function App() {
    count = state(0);
    return (
      <p
        class={count() === 0 ? 'base zero' : 'base one'}
        title={`t${count()}`}
        style={{ color: count() === 0 ? 'red' : 'blue' }}
        data-count={count()}
      >
        x
      </p>
    );
  }
  try {
    createIsland({ root: container, component: App });
    flushScheduler();
    const paragraph = container.querySelector('p')!;
    decorate(paragraph);
    count.set(1);
    flushScheduler();
    expect(container.querySelector('p')).toBe(paragraph);
    expectDecorated(paragraph);
    expect(paragraph.getAttribute('title')).toBe('t1');
    expect(paragraph.getAttribute('data-count')).toBe('1');
    expect(paragraph.classList.contains('base')).toBe(true);
    expect(paragraph.classList.contains('one')).toBe(true);
    expect(paragraph.classList.contains('zero')).toBe(false);
    expect(paragraph.style.color).toBe('blue');
  } finally {
    cleanup();
  }
});

test('should preserve third-party styles next to an unchanged string style prop', () => {
  const { container, cleanup } = createTestContainer();
  let count!: State<number>;
  function App() {
    count = state(0);
    return (
      <p class="fixed" style="color: red" data-count={count()}>
        x
      </p>
    );
  }
  try {
    createIsland({ root: container, component: App });
    flushScheduler();
    const paragraph = container.querySelector('p')!;
    decorate(paragraph);
    count.set(1);
    flushScheduler();
    expectDecorated(paragraph);
    expect(paragraph.classList.contains('fixed')).toBe(true);
    expect(paragraph.style.color).toBe('red');
  } finally {
    cleanup();
  }
});

test('should still remove attributes, classes and styles that Askr previously rendered', () => {
  const { container, cleanup } = createTestContainer();
  let on!: State<boolean>;
  function App() {
    on = state(true);
    return on() ? (
      <p
        class="a b"
        title="t"
        aria-hidden="false"
        style={{ color: 'red', 'font-weight': 'bold' }}
      >
        x
      </p>
    ) : (
      <p class="a" style={{ color: 'red' }}>
        x
      </p>
    );
  }
  try {
    createIsland({ root: container, component: App });
    flushScheduler();
    const paragraph = container.querySelector('p')!;
    paragraph.setAttribute('data-tooltip', 'external');
    paragraph.classList.add('ext');
    paragraph.style.transform = 'scale(2)';
    on.set(false);
    flushScheduler();
    expect(container.querySelector('p')).toBe(paragraph);
    expect(paragraph.hasAttribute('title')).toBe(false);
    expect(paragraph.hasAttribute('aria-hidden')).toBe(false);
    expect(paragraph.classList.contains('b')).toBe(false);
    expect(paragraph.classList.contains('a')).toBe(true);
    expect(paragraph.style.fontWeight).toBe('');
    expect(paragraph.style.color).toBe('red');
    expect(paragraph.getAttribute('data-tooltip')).toBe('external');
    expect(paragraph.classList.contains('ext')).toBe(true);
    expect(paragraph.style.transform).toBe('scale(2)');
  } finally {
    cleanup();
  }
});

test('should patch only Askr-owned declarations when a string style changes', () => {
  const { container, cleanup } = createTestContainer();
  let count!: State<number>;
  function App() {
    count = state(0);
    return (
      <p style={count() === 0 ? 'color: red; margin: 1px' : 'color: blue'}>x</p>
    );
  }
  try {
    createIsland({ root: container, component: App });
    flushScheduler();
    const paragraph = container.querySelector('p')!;
    decorate(paragraph);
    count.set(1);
    flushScheduler();
    expectDecorated(paragraph);
    expect(paragraph.style.color).toBe('blue');
    expect(paragraph.style.margin).toBe('');
  } finally {
    cleanup();
  }
});

test('should preserve third-party classes and styles next to reactive class and style props', () => {
  const { container, cleanup } = createTestContainer();
  let on!: State<boolean>;
  let active!: State<boolean>;
  function App() {
    on = state(true);
    active = state(false);
    return (
      <div data-on={on()}>
        <p
          class={() => (active() ? 'item active' : 'item')}
          style={() => ({ color: active() ? 'blue' : 'red' })}
        >
          x
        </p>
      </div>
    );
  }
  try {
    createIsland({ root: container, component: App });
    flushScheduler();
    const paragraph = container.querySelector('p')!;
    decorate(paragraph);
    active.set(true);
    flushScheduler();
    on.set(false);
    flushScheduler();
    expect(container.querySelector('p')).toBe(paragraph);
    expectDecorated(paragraph);
    expect(paragraph.classList.contains('active')).toBe(true);
    expect(paragraph.style.color).toBe('blue');
    active.set(false);
    flushScheduler();
    expectDecorated(paragraph);
    expect(paragraph.classList.contains('active')).toBe(false);
    expect(paragraph.style.color).toBe('red');
  } finally {
    cleanup();
  }
});

test('should restore owned values that other code overwrote', () => {
  const { container, cleanup } = createTestContainer();
  let count!: State<number>;
  function App() {
    count = state(0);
    return (
      <p
        class="owned"
        title="owned"
        style={{ color: 'red' }}
        data-count={count()}
      >
        x
      </p>
    );
  }
  try {
    createIsland({ root: container, component: App });
    flushScheduler();
    const paragraph = container.querySelector('p')!;
    paragraph.classList.remove('owned');
    paragraph.classList.add('ext');
    paragraph.setAttribute('title', 'external');
    paragraph.style.color = 'green';
    count.set(1);
    flushScheduler();
    expect(paragraph.classList.contains('owned')).toBe(true);
    expect(paragraph.classList.contains('ext')).toBe(true);
    expect(paragraph.getAttribute('title')).toBe('owned');
    expect(paragraph.style.color).toBe('red');
  } finally {
    cleanup();
  }
});

test('should restore the applied-props baseline when a render rolls back', () => {
  const { container, cleanup } = createTestContainer();
  let step!: State<number>;
  function Child({ step }: { step: number }) {
    if (step === 1) throw new Error('child failed');
    return <span>{step}</span>;
  }
  const classes = ['a', 'b', 'c'];
  function App() {
    step = state(0);
    const s = step();
    return (
      <button
        disabled={s === 0}
        class={classes[s]}
        title={s === 0 ? 'x' : undefined}
      >
        <Child step={s} />
      </button>
    );
  }
  try {
    createIsland({ root: container, component: App });
    flushScheduler();
    expect(() => {
      step.set(1);
      flushScheduler();
    }).toThrow('child failed');
    const button = container.querySelector('button')!;
    expect(button.getAttribute('class')).toBe('a');
    step.set(2);
    flushScheduler();
    expect(container.querySelector('button')).toBe(button);
    expect(button.getAttribute('class')).toBe('c');
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.hasAttribute('title')).toBe(false);
  } finally {
    cleanup();
  }
});

test('should restore applied-props records with a root host snapshot', () => {
  const root = document.createElement('div');
  const child = document.createElement('p');
  const fresh = document.createElement('span');
  root.append(child, fresh);
  recordAppliedProps(child, { class: 'a', title: 'x' });
  const before = getAppliedProps(child);
  const snapshot = captureRootHost(root);
  recordAppliedProps(child, { class: 'b' });
  recordAppliedProps(fresh, { title: 'y' });
  expect(snapshot.restore()).toEqual([]);
  expect(getAppliedProps(child)).toBe(before);
  expect(getAppliedProps(fresh)).toBeUndefined();
});

test('should record only rendered attribute props, without children or closures', () => {
  const element = document.createElement('p');
  const onClick = () => {};
  const title = () => 'reactive';
  recordAppliedProps(element, {
    children: [<span>child</span>],
    key: 1,
    ref: () => {},
    onClick,
    title,
    class: 'a',
    hidden: false,
    'aria-hidden': false,
    'data-empty': null,
  });
  const record = getAppliedProps(element)!;
  expect(Object.keys(record)).toEqual(['title', 'class', 'aria-hidden']);
  expect(Object.values(record)).not.toContain(title);
});
