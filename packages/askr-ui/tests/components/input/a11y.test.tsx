import { describe, expect, it } from 'vite-plus/test';
import { Input } from '../../../src/components/primitives/input/input';
import { INPUT_A11Y_CONTRACT } from '../../../src/components/primitives/input/input.a11y';
import { expectNoAxeViolations } from '../../accessibility';
import { mount, unmount } from '../../test-utils';

describe('Input - Accessibility', () => {
  it('should have no automated axe violations given labelled input', async () => {
    await expectNoAxeViolations(<Input aria-label="Email" type="email" />);
  });

  it('should expose aria-disabled when disabled', () => {
    const container = mount(<Input disabled />);

    try {
      const input = container.querySelector('input');
      expect(
        input?.getAttribute(INPUT_A11Y_CONTRACT.DISABLED_ATTRIBUTES.asChild)
      ).toBe('true');
    } finally {
      unmount(container);
    }
  });

  it('should preserve native host semantics from contract', () => {
    const container = mount(<Input />);

    try {
      const host = container.querySelector(INPUT_A11Y_CONTRACT.HOST_ELEMENT);
      expect(host).toBeTruthy();
    } finally {
      unmount(container);
    }
  });
});
