import { describe, it } from 'vitest';
import { FocusScope } from '../../../src/components/focus-scope';
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
