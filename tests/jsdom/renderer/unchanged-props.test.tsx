import { expect, test, vi } from 'vite-plus/test';
import { state, type State } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

test('should not read or write the DOM for props whose values did not change', () => {
  const { container, cleanup } = createTestContainer();
  let count!: State<number>;
  function App() {
    count = state(0);
    return (
      <ul>
        {Array.from({ length: 20 }, (_, i) => (
          <li
            key={i}
            class="row active"
            title="same"
            data-x="1"
            style={{ color: 'red', width: 10 }}
          >
            {i === 0 ? count() : 'static'}
          </li>
        ))}
      </ul>
    );
  }
  try {
    createIsland({ root: container, component: App });
    flushScheduler();
    const getAttribute = vi.spyOn(Element.prototype, 'getAttribute');
    const setAttribute = vi.spyOn(Element.prototype, 'setAttribute');
    const removeAttribute = vi.spyOn(Element.prototype, 'removeAttribute');
    const getPropertyValue = vi.spyOn(
      CSSStyleDeclaration.prototype,
      'getPropertyValue'
    );
    const setProperty = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty');
    count.set(1);
    flushScheduler();
    expect(container.querySelector('li')!.textContent).toBe('1');
    expect(getAttribute).not.toHaveBeenCalled();
    expect(setAttribute).not.toHaveBeenCalled();
    expect(removeAttribute).not.toHaveBeenCalled();
    expect(getPropertyValue).not.toHaveBeenCalled();
    expect(setProperty).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    cleanup();
  }
});

test('should still write a style entry that changed', () => {
  const { container, cleanup } = createTestContainer();
  let color!: State<string>;
  function App() {
    color = state('red');
    return <p style={{ color: color(), width: 10 }}>x</p>;
  }
  try {
    createIsland({ root: container, component: App });
    flushScheduler();
    color.set('blue');
    flushScheduler();
    expect(container.querySelector('p')!.style.color).toBe('blue');
    expect(container.querySelector('p')!.style.width).toBe('10px');
  } finally {
    cleanup();
  }
});

test('should keep verifying a controlled input value against the live DOM', () => {
  const { container, cleanup } = createTestContainer();
  let tick!: State<number>;
  function App() {
    tick = state(0);
    return (
      <div data-tick={tick()}>
        <input value="fixed" />
      </div>
    );
  }
  try {
    createIsland({ root: container, component: App });
    flushScheduler();
    const input = container.querySelector('input')!;
    input.value = 'typed';
    tick.set(1);
    flushScheduler();
    expect(input.value).toBe('fixed');
  } finally {
    cleanup();
  }
});
