import { expect, it } from 'vite-plus/test';
import { state } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';
import { allowFrameworkWarnings } from '../../setup-env';

function resetFineGrainedDiagnostics(): void {
  const ns = (
    globalThis as typeof globalThis & {
      __ASKR__?: Record<string, unknown>;
    }
  ).__ASKR__;

  if (!ns) {
    return;
  }

  ns['componentReruns'] = 0;
  ns['effectRuns'] = 0;
  ns['textNodeWrites'] = 0;
}

it('should isolate 1000 scalar text bindings from parent rerenders', async () => {
  allowFrameworkWarnings(
    /Missing keys on dynamic lists in Component\. Each child in a list should have a unique "key" prop\./
  );

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

  resetFineGrainedDiagnostics();

  count!.set(1);
  flushScheduler();

  const ns = (
    globalThis as typeof globalThis & {
      __ASKR__?: Record<string, unknown>;
    }
  ).__ASKR__;

  expect(parentRenderCount).toBe(1);
  expect(ns?.['componentReruns']).toBe(0);
  expect(ns?.['effectRuns']).toBe(1000);
  expect(ns?.['textNodeWrites']).toBe(1000);

  const updatedSpans = Array.from(container.querySelectorAll('span'));
  for (let index = 0; index < updatedSpans.length; index += 1) {
    expect(updatedSpans[index]?.textContent).toBe('1');
    expect(updatedSpans[index]?.firstChild).toBe(firstTextNodes[index]);
  }

  cleanup();
}, 15000);
