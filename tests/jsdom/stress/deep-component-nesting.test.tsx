import { afterEach, describe, expect, it } from 'vite-plus/test';
import { state } from '@askrjs/askr';
import { createIsland } from '@askrjs/askr/boot';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

const nestingDepth = 10_000;
const stressTestTimeout = 60_000;

describe('deep component nesting', () => {
  const fixtures: Array<ReturnType<typeof createTestContainer>> = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      fixture.cleanup();
    }
  });

  it(
    'should mount a component chain past the former stack-overflow depth',
    () => {
      const fixture = createTestContainer();
      fixtures.push(fixture);

      function Nested({ depth }: { depth: number }) {
        return depth === 0 ? (
          <button data-depth-leaf="true">leaf</button>
        ) : (
          <Nested depth={depth - 1} />
        );
      }

      expect(() =>
        createIsland({
          root: fixture.container,
          component: () => <Nested depth={nestingDepth} />,
        })
      ).not.toThrow();
      expect(
        fixture.container.querySelector('[data-depth-leaf="true"]')?.textContent
      ).toBe('leaf');
    },
    stressTestTimeout
  );

  it(
    'should reconcile a retained component chain without recursive rendering',
    () => {
      const fixture = createTestContainer();
      fixtures.push(fixture);
      let labelState!: ReturnType<typeof state<string>>;

      function Nested({ depth, label }: { depth: number; label: string }) {
        return depth === 0 ? (
          <button data-depth-leaf="true">{label}</button>
        ) : (
          <Nested depth={depth - 1} label={label} />
        );
      }

      function App() {
        labelState = state('before');
        return <Nested depth={1_000} label={labelState()} />;
      }

      createIsland({ root: fixture.container, component: App });
      labelState.set('after');
      expect(() => flushScheduler()).not.toThrow();
      expect(
        fixture.container.querySelector('[data-depth-leaf="true"]')?.textContent
      ).toBe('after');
    },
    stressTestTimeout
  );
});
