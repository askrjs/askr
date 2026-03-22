import { describe, expect, it } from 'vitest';
import { Textarea } from '../../../src/components/textarea/textarea';
import { TEXTAREA_A11Y_CONTRACT } from '../../../src/components/textarea/textarea.a11y';
import { expectNoAxeViolations } from '../../accessibility';
import { mount, unmount } from '../../test-utils';

describe('Textarea - Accessibility', () => {
  it('should have no automated axe violations given labelled textarea', async () => {
    await expectNoAxeViolations(<Textarea aria-label="Notes" rows={3} />);
  });

  it('should expose aria-disabled when disabled', () => {
    const container = mount(<Textarea disabled />);

    try {
      const textarea = container.querySelector('textarea');
      expect(
        textarea?.getAttribute(
          TEXTAREA_A11Y_CONTRACT.DISABLED_ATTRIBUTES.asChild
        )
      ).toBe('true');
    } finally {
      unmount(container);
    }
  });

  it('should preserve native host semantics from contract', () => {
    const container = mount(<Textarea />);

    try {
      const host = container.querySelector(TEXTAREA_A11Y_CONTRACT.HOST_ELEMENT);
      expect(host).toBeTruthy();
    } finally {
      unmount(container);
    }
  });
});
