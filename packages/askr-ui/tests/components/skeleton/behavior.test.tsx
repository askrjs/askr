import { describe, expect, it } from 'vitest';
import { Skeleton } from '../../../src/components/skeleton';
import { SKELETON_A11Y_CONTRACT } from '../../../src/components/skeleton/skeleton.a11y';
import { mount, unmount } from '../../test-utils';

describe('Skeleton - Behavior', () => {
  it('should render skeleton with aria-hidden marker', () => {
    const container = mount(<Skeleton>Loading</Skeleton>);

    try {
      expect(
        container
          .querySelector(`[${SKELETON_A11Y_CONTRACT.MARKER}="true"]`)
          ?.getAttribute(SKELETON_A11Y_CONTRACT.DECORATIVE_ATTRIBUTE)
      ).toBe(SKELETON_A11Y_CONTRACT.DECORATIVE_VALUE);
    } finally {
      unmount(container);
    }
  });
});
