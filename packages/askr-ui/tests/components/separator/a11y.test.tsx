import { describe, expect, it } from 'vitest';
import { Separator } from '../../../src/components/separator/separator';
import { SEPARATOR_A11Y_CONTRACT } from '../../../src/components/separator/separator.a11y';
import { expectNoAxeViolations } from '../../accessibility';
import { mount, unmount } from '../../test-utils';

describe('Separator - Accessibility', () => {
  it('should have no automated axe violations given semantic separator', async () => {
    await expectNoAxeViolations(
      <div>
        <span>Above</span>
        <Separator />
        <span>Below</span>
      </div>
    );
  });

  it('should expose presentation role when decorative', () => {
    const container = mount(<Separator decorative />);

    try {
      const separator = container.querySelector('div');
      expect(separator?.getAttribute('role')).toBe(
        SEPARATOR_A11Y_CONTRACT.DECORATIVE_ROLE
      );
      expect(
        separator?.hasAttribute(SEPARATOR_A11Y_CONTRACT.ORIENTATION_ATTRIBUTE)
      ).toBe(false);
    } finally {
      unmount(container);
    }
  });
});
