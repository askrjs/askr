import { afterEach, describe, expect, it } from 'vite-plus/test';
import { createTestContainer } from '../../../test-utils/render/test-renderer';
import {
  runDeepNestingClientLifecycle,
  supportedNestingDepth,
  type DeepNestingShape,
} from '../../../test-utils/fixtures/deep-nesting';

// Every case takes well under a second; the bound leaves headroom for slow CI
// hosts without letting a performance regression hide behind a long timeout.
const stressTestTimeout = 15_000;

const clientCases: Array<[DeepNestingShape, number]> = [
  ['wrapper-chain', supportedNestingDepth.wrapperChain],
  ['element-interleaved', supportedNestingDepth.elementNesting],
  ['element-only', supportedNestingDepth.elementNesting],
];

describe('deep component nesting', () => {
  const fixtures: Array<ReturnType<typeof createTestContainer>> = [];

  afterEach(() => {
    for (const fixture of fixtures.splice(0)) {
      fixture.cleanup();
    }
  });

  it.each(clientCases)(
    'should mount, reconcile, and tear down %s nesting %i levels deep',
    (shape, depth) => {
      const fixture = createTestContainer();
      fixtures.push(fixture);

      expect(
        runDeepNestingClientLifecycle(fixture.container, shape, depth)
      ).toEqual({
        mounted: 'before:0',
        leafUpdated: 'before:5',
        rootUpdated: 'after:5',
        leafAbortedOnTeardown: true,
      });
    },
    stressTestTimeout
  );
});
