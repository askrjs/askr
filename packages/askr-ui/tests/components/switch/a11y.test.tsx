import { describe, expect, it } from 'vitest';
import { Switch } from '../../../src/components/switch/switch';
import { SWITCH_A11Y_CONTRACT } from '../../../src/components/switch/switch.a11y';
import { expectNoAxeViolations } from '../../accessibility';
import { mount, unmount } from '../../test-utils';

describe('Switch - Accessibility', () => {
  it('should have no automated axe violations given default switch', async () => {
    await expectNoAxeViolations(<Switch>Airplane mode</Switch>);
  });

  it('should expose switch semantics when composed with asChild', () => {
    const container = mount(
      <Switch asChild defaultChecked>
        <div>Power</div>
      </Switch>
    );

    try {
      const element = container.querySelector(
        `[role="${SWITCH_A11Y_CONTRACT.ROLE}"]`
      );
      expect(element?.getAttribute('role')).toBe(SWITCH_A11Y_CONTRACT.ROLE);
      expect(
        element?.getAttribute(SWITCH_A11Y_CONTRACT.CHECKED_ATTRIBUTE)
      ).toBe('true');
    } finally {
      unmount(container);
    }
  });

  it('should publish expected keyboard activation contract values', () => {
    expect(SWITCH_A11Y_CONTRACT.KEYBOARD_ACTIVATION).toEqual([
      'Enter',
      'Space',
    ]);
  });
});
