import { describe, it } from 'vitest';
import { Inline } from '../../../src/components/inline/inline';
import { expectNoAxeViolations } from '../../accessibility';

describe('Inline - Accessibility', () => {
  it('should have no automated axe violations given inline with children', async () => {
    await expectNoAxeViolations(
      <Inline>
        <span>Item one</span>
        <span>Item two</span>
      </Inline>
    );
  });

  it('should have no automated axe violations given inline with gap and wrap', async () => {
    await expectNoAxeViolations(
      <Inline gap="0.5rem" wrap="wrap">
        Content
      </Inline>
    );
  });
});
