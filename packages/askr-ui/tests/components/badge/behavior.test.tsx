import { describe, expect, it } from 'vitest';
import { Badge } from '../../../src/components/badge';
import { BADGE_A11Y_CONTRACT } from '../../../src/components/badge/badge.a11y';
import { mount, unmount } from '../../test-utils';

describe('Badge - Behavior', () => {
  it('should render badge headless marker', () => {
    const container = mount(<Badge>Beta</Badge>);

    try {
      expect(
        container.querySelector(`[${BADGE_A11Y_CONTRACT.MARKER}="true"]`)
          ?.textContent
      ).toBe('Beta');
    } finally {
      unmount(container);
    }
  });
});
