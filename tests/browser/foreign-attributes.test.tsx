import { expect, test } from 'vite-plus/test';
import { state, type State } from '../../src';
import { createIsland } from '../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';

test('should keep third-party attributes, classes and styles through re-renders in a real browser', () => {
  const { container, cleanup } = createTestContainer();
  let count!: State<number>;
  function App() {
    count = state(0);
    return (
      <div data-count={count()}>
        <p>unchanged</p>
        <p
          class={count() === 0 ? 'base zero' : 'base one'}
          style={count() === 0 ? 'color: red; margin: 1px' : 'color: blue'}
        >
          changed
        </p>
        <p style={{ color: count() === 0 ? 'red' : 'blue', '--askr-x': '1' }}>
          object
        </p>
      </div>
    );
  }
  try {
    createIsland({ root: container, component: App });
    flushScheduler();
    const paragraphs = Array.from(container.querySelectorAll('p'));
    for (const paragraph of paragraphs) {
      paragraph.setAttribute('aria-hidden', 'true');
      paragraph.inert = true;
      paragraph.classList.add('ext');
      paragraph.style.transform = 'scale(2)';
    }
    count.set(1);
    flushScheduler();
    expect(Array.from(container.querySelectorAll('p'))).toEqual(paragraphs);
    for (const paragraph of paragraphs) {
      expect(paragraph.getAttribute('aria-hidden')).toBe('true');
      expect(paragraph.inert).toBe(true);
      expect(paragraph.classList.contains('ext')).toBe(true);
      expect(paragraph.style.transform).toBe('scale(2)');
    }
    const [, changed, object] = paragraphs;
    expect(changed.className.split(' ').sort()).toEqual(['base', 'ext', 'one']);
    expect(changed.style.color).toBe('blue');
    expect(changed.style.marginTop).toBe('');
    expect(object.style.color).toBe('blue');
    expect(object.style.getPropertyValue('--askr-x')).toBe('1');
  } finally {
    cleanup();
  }
});
