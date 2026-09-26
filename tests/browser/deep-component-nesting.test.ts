import { expect, test } from 'vite-plus/test';
import { createTestContainer } from '../../test-utils/render/test-renderer';
import {
  runDeepNestingClientLifecycle,
  supportedNestingDepth,
  type DeepNestingShape,
} from '../../test-utils/fixtures/deep-nesting';

const clientCases: Array<[DeepNestingShape, number]> = [
  ['wrapper-chain', supportedNestingDepth.wrapperChain],
  ['element-interleaved', supportedNestingDepth.elementNesting],
  ['element-only', supportedNestingDepth.elementNesting],
];

test.each(clientCases)(
  'should mount, reconcile, and tear down %s nesting %i levels deep without overflowing the browser stack',
  (shape, depth) => {
    const { container, cleanup } = createTestContainer();
    try {
      expect(runDeepNestingClientLifecycle(container, shape, depth)).toEqual({
        mounted: 'before:0',
        leafUpdated: 'before:5',
        rootUpdated: 'after:5',
        leafAbortedOnTeardown: true,
      });
    } finally {
      cleanup();
    }
  }
);
