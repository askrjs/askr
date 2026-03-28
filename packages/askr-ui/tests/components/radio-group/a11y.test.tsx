import { describe, expect, it } from 'vite-plus/test';
import {
  RadioGroup,
  RadioGroupItem,
} from '../../../src/components/primitives/radio-group/radio-group';
import { RADIO_GROUP_A11Y_CONTRACT } from '../../../src/components/primitives/radio-group/radio-group.a11y';
import { expectNoAxeViolations } from '../../accessibility';
import { mount, unmount } from '../../test-utils';

describe('RadioGroup - Accessibility', () => {
  it('should have no automated axe violations given labelled radio group', async () => {
    await expectNoAxeViolations(
      <RadioGroup aria-label="Size" defaultValue="m">
        <RadioGroupItem value="s">Small</RadioGroupItem>
        <RadioGroupItem value="m">Medium</RadioGroupItem>
      </RadioGroup>
    );
  });

  it('should expose radiogroup and aria-checked semantics', () => {
    const container = mount(
      <RadioGroup aria-label="Size" defaultValue="m">
        <RadioGroupItem value="s">Small</RadioGroupItem>
        <RadioGroupItem value="m">Medium</RadioGroupItem>
      </RadioGroup>
    );

    try {
      const group = container.querySelector(
        `[role="${RADIO_GROUP_A11Y_CONTRACT.GROUP_ROLE}"]`
      );
      const items = container.querySelectorAll('button');
      expect(group).toBeTruthy();
      expect(group?.getAttribute('role')).toBe(
        RADIO_GROUP_A11Y_CONTRACT.GROUP_ROLE
      );
      expect(items[0]?.getAttribute('role')).toBe(
        RADIO_GROUP_A11Y_CONTRACT.ITEM_ROLE
      );
      expect(
        items[0]?.getAttribute(RADIO_GROUP_A11Y_CONTRACT.CHECKED_ATTRIBUTE)
      ).toBe('false');
      expect(
        items[1]?.getAttribute(RADIO_GROUP_A11Y_CONTRACT.CHECKED_ATTRIBUTE)
      ).toBe('true');
    } finally {
      unmount(container);
    }
  });
});
