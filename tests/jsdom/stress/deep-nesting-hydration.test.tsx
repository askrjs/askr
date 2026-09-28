import { afterEach, describe, expect, it } from 'vite-plus/test';
import { createTestContainer } from '../../../test-utils/render/test-renderer';
import {
  runDeepNestingServerLifecycle,
  supportedNestingDepth,
  type DeepNestingShape,
} from '../../../test-utils/fixtures/deep-nesting';

// Server rendering and hydration recurse through the tree, so these are the
// documented depths rather than the 10,000-link client wrapper guarantee.
// Hydration runs in its own file because an island mount fixes the execution
// model.
const stressTestTimeout = 15_000;

const serverCases: Array<[DeepNestingShape, number]> = [
  ['wrapper-chain', supportedNestingDepth.wrapperChainServer],
  ['element-interleaved', supportedNestingDepth.elementNesting],
  ['element-only', supportedNestingDepth.elementNesting],
];

describe('deep nesting server rendering and hydration', () => {
  const fixtures: Array<ReturnType<typeof createTestContainer>> = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      fixture.cleanup();
    }
  });

  it.each(serverCases)(
    'should server-render and hydrate %s nesting %i levels deep',
    async (shape, depth) => {
      const fixture = createTestContainer();
      fixtures.push(fixture);

      const result = await runDeepNestingServerLifecycle(
        fixture.container,
        shape,
        depth
      );

      expect(result.html).toContain('before:0');
      expect(result).toMatchObject({
        hydratedInPlace: true,
        updatedAfterHydration: 'after:0',
        leafAbortedOnTeardown: true,
      });
    },
    stressTestTimeout
  );
});
