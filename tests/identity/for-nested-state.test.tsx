import { expect } from 'chai';
import { test } from 'vitest';
import { createIsland, state } from '../../src';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { For } from '../../src/for';

test('should update item when nested state changes', () => {
  const { container, cleanup } = createTestContainer();

  const Component = () => {
    const rows = [1];
    return (
      <div>
        {For(
          () => rows,
          (_, index) => index,
          (_n) => {
            const c = state(0);
            return (
              <button onClick={() => c.set(c() + 1)}>{String(c())}</button>
            );
          }
        )}
      </div>
    );
  };

  createIsland({ root: container, component: Component });

  const btn = container.querySelector('button') as HTMLButtonElement;
  expect(btn.textContent).to.equal('0');

  btn.click();
  flushScheduler();

  // Re-query the button since the parent re-render creates new DOM elements
  const btnAfter = container.querySelector('button') as HTMLButtonElement;
  expect(btnAfter.textContent).to.equal('1');

  cleanup();
});
