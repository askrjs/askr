import { describe, expect, it } from 'vite-plus/test';
import { Spinner } from '../../../src/components/primitives/spinner';
import { SPINNER_A11Y_CONTRACT } from '../../../src/components/primitives/spinner/spinner.a11y';
import { mount, unmount } from '../../test-utils';

describe('Spinner - Behavior', () => {
  it('should expose aria-valuetext for label', () => {
    const container = mount(<Spinner label="Syncing" />);

    try {
      expect(
        container
          .querySelector(`[role="${SPINNER_A11Y_CONTRACT.ROLE}"]`)
          ?.getAttribute(SPINNER_A11Y_CONTRACT.VALUE_TEXT_ATTRIBUTE)
      ).toBe('Syncing');
    } finally {
      unmount(container);
    }
  });
});
