import { expect, test } from 'vite-plus/test';
import { createTestContainer } from '../../test-utils/render/test-renderer';
import {
  runDeepNestingServerLifecycle,
  supportedNestingDepth,
  type DeepNestingShape,
} from '../../test-utils/fixtures/deep-nesting';

// Hydration runs in its own file because an island mount fixes the execution
// model for the page.
const serverCases: Array<[DeepNestingShape, number]> = [
  ['wrapper-chain', supportedNestingDepth.wrapperChainServer],
  ['element-interleaved', supportedNestingDepth.elementNesting],
  ['element-only', supportedNestingDepth.elementNesting],
];

test.each(serverCases)(
  'should server-render and hydrate %s nesting %i levels deep without overflowing the browser stack',
  async (shape, depth) => {
    const { container, cleanup } = createTestContainer();
    try {
      const result = await runDeepNestingServerLifecycle(
        container,
        shape,
        depth
      );

      expect(result.html).toContain('before:0');
      expect(result).toMatchObject({
        hydratedInPlace: true,
        updatedAfterHydration: 'after:0',
        leafAbortedOnTeardown: true,
      });
    } finally {
      cleanup();
    }
  }
);
