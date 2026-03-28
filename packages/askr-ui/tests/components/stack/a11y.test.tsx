import { describe, it } from 'vite-plus/test';
import { Stack } from '../../../src/components/primitives/stack/stack';
import { expectNoAxeViolations } from '../../accessibility';

describe('Stack - Accessibility', () => {
  it('should have no automated axe violations given stack with children', async () => {
    await expectNoAxeViolations(
      <Stack>
        <span>Item one</span>
        <span>Item two</span>
      </Stack>
    );
  });

  it('should have no automated axe violations given stack with gap and align', async () => {
    await expectNoAxeViolations(
      <Stack gap="1rem" align="center">
        Content
      </Stack>
    );
  });
});
