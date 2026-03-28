import { describe, expect, it } from 'vite-plus/test';
import { VisuallyHidden } from '../../../src/components/primitives/visually-hidden/visually-hidden';
import { expectNoAxeViolations } from '../../accessibility';
import { mount, unmount } from '../../test-utils';

describe('VisuallyHidden - Accessibility', () => {
  it('should have no automated axe violations given hidden accessible text', async () => {
    await expectNoAxeViolations(
      <button>
        <VisuallyHidden>Open menu</VisuallyHidden>
      </button>
    );
  });

  it('should apply hidden attributes to composed child', () => {
    const container = mount(
      <VisuallyHidden asChild children={<strong>Hidden</strong>} />
    );

    try {
      const strong = container.querySelector('strong');
      expect(strong?.getAttribute('data-askr-visually-hidden')).toBe('true');
      expect(strong?.getAttribute('style')).toContain('position:absolute');
    } finally {
      unmount(container);
    }
  });
});
