import { describe, expect, it } from 'vite-plus/test';
import { Badge } from '../../../src/components/primitives/badge';
import { BADGE_A11Y_CONTRACT } from '../../../src/components/primitives/badge/badge.a11y';
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
