import { describe, it } from 'vite-plus/test';
import { FocusScope } from '../../../src/components/composites/focus-scope';
import { expectNoAxeViolations } from '../../accessibility';

describe('FocusScope - Accessibility', () => {
  it('should have no automated axe violations given scoped focusables', async () => {
    await expectNoAxeViolations(
      <FocusScope loop>
        <button type="button">First</button>
        <button type="button">Second</button>
      </FocusScope>
    );
  });
});
