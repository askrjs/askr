import { afterEach, describe, expect, it } from 'vite-plus/test';
import { createIsland } from '@askrjs/askr/boot';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

const nestingDepth = Number(process.env.ASKR_NESTING_DEPTH ?? 5_000);

describe('deep component nesting', () => {
  const fixtures: Array<ReturnType<typeof createTestContainer>> = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      fixture.cleanup();
    }
  });

  it('mounts a component chain past the former stack-overflow depth', () => {
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
  });
});
