import { expect, it } from 'vite-plus/test';
import { state } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

it('should isolate 1000 scalar text bindings from parent rerenders', async () => {
  const { container, cleanup } = createTestContainer();
  let count: ReturnType<typeof state<number>> | null = null;
  let parentRenderCount = 0;

  const Component = () => {
    parentRenderCount += 1;
    count = state(0);

    return (
      <div>
        {Array.from({ length: 1000 }, () => (
          <span>{() => count!()}</span>
        ))}
      </div>
    );
  };

  createIsland({ root: container, component: Component });
  flushScheduler();

  const spans = Array.from(container.querySelectorAll('span'));
  expect(spans).toHaveLength(1000);
  expect(parentRenderCount).toBe(1);

  const firstTextNodes = spans.map((span) => span.firstChild);

  count!.set(1);
  flushScheduler();

  expect(parentRenderCount).toBe(1);

  const updatedSpans = Array.from(container.querySelectorAll('span'));
  for (let index = 0; index < updatedSpans.length; index += 1) {
    expect(updatedSpans[index]?.textContent).toBe('1');
    expect(updatedSpans[index]?.firstChild).toBe(firstTextNodes[index]);
  }

  cleanup();
}, 15000);
