import { describe, expect, it } from 'vite-plus/test';
import { Label } from '../../../src/components/primitives/label/label';
import { LABEL_A11Y_CONTRACT } from '../../../src/components/primitives/label/label.a11y';
import { expectNoAxeViolations } from '../../accessibility';
import { mount, unmount } from '../../test-utils';

describe('Label - Accessibility', () => {
  it('should have no automated axe violations given labelled form control', async () => {
    await expectNoAxeViolations(
      <div>
        <Label htmlFor="email">Email</Label>
        <input id="email" />
      </div>
    );
  });

  it('should preserve htmlFor linkage on native label', () => {
    const container = mount(<Label htmlFor="email">Email</Label>);

    try {
      const label = container.querySelector(LABEL_A11Y_CONTRACT.ELEMENT);
      expect(
        label?.getAttribute(LABEL_A11Y_CONTRACT.ASSOCIATION_ATTRIBUTE)
      ).toBe('email');
    } finally {
      unmount(container);
    }
  });
});
