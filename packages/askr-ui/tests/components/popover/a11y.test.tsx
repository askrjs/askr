import { describe, expect, it } from 'vite-plus/test';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../../src/components/composites/popover';
import { POPOVER_A11Y_CONTRACT } from '../../../src/components/composites/popover/popover.a11y';
import { expectNoAxeViolations } from '../../accessibility';
import { mount, unmount } from '../../test-utils';

describe('Popover - Accessibility', () => {
  it('should have no automated axe violations given default open popover', async () => {
    await expectNoAxeViolations(
      <Popover defaultOpen>
        <PopoverTrigger>Open popover</PopoverTrigger>
        <PopoverContent>Popover body</PopoverContent>
      </Popover>
    );
  });

  it('should label dialog content from trigger by default', () => {
    const container = mount(
      <Popover defaultOpen>
        <PopoverTrigger>Open popover</PopoverTrigger>
        <PopoverContent>Popover body</PopoverContent>
      </Popover>
    );

    try {
      const trigger = container.querySelector(
        `[${POPOVER_A11Y_CONTRACT.TRIGGER_ATTRIBUTES.popup}="dialog"]`
      );
      const content = document.body.querySelector(
        `[role="${POPOVER_A11Y_CONTRACT.CONTENT_ATTRIBUTES.role}"]`
      );

      expect(trigger).toBeTruthy();
      expect(content).toBeTruthy();
      expect(trigger?.id).toBeTruthy();
      expect(
        content?.getAttribute(
          POPOVER_A11Y_CONTRACT.CONTENT_ATTRIBUTES.labelledBy
        )
      ).toBe(trigger?.id);
    } finally {
      unmount(container);
    }
  });

  it('should allow explicit content labeling via aria-label', () => {
    const container = mount(
      <Popover defaultOpen>
        <PopoverTrigger>Open popover</PopoverTrigger>
        <PopoverContent aria-label="Popover content">
          Popover body
        </PopoverContent>
      </Popover>
    );

    try {
      const content = document.body.querySelector(
        `[role="${POPOVER_A11Y_CONTRACT.CONTENT_ATTRIBUTES.role}"]`
      );

      expect(content).toBeTruthy();
      expect(content?.getAttribute('aria-label')).toBe('Popover content');
      expect(content?.hasAttribute('aria-labelledby')).toBe(false);
    } finally {
      unmount(container);
    }
  });
});
