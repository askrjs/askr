import { describe, it } from 'vite-plus/test';
import { FocusRing } from '../../../src/components/composites/focus-ring';
import { expectNoAxeViolations } from '../../accessibility';

describe('FocusRing - Accessibility', () => {
  it('should have no automated axe violations given focusable child', async () => {
    await expectNoAxeViolations(
      <FocusRing>
        <button type="button">Focusable</button>
      </FocusRing>
    );
  });
});
