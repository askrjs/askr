import { describe, it } from 'vite-plus/test';
import { Center } from '../../../src/components/primitives/center/center';
import { expectNoAxeViolations } from '../../accessibility';

describe('Center - Accessibility', () => {
  it('should have no automated axe violations given default center', async () => {
    await expectNoAxeViolations(<Center>Content</Center>);
  });

  it('should have no automated axe violations given center with min-height', async () => {
    await expectNoAxeViolations(
      <Center axis="vertical" minHeight="100vh">
        Content
      </Center>
    );
  });
});
