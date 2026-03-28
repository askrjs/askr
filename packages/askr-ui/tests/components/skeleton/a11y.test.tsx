import { describe, it } from 'vite-plus/test';
import { Skeleton } from '../../../src/components/primitives/skeleton';
import { expectNoAxeViolations } from '../../accessibility';

describe('Skeleton - Accessibility', () => {
  it('should have no automated axe violations given decorative skeleton', async () => {
    await expectNoAxeViolations(<Skeleton />);
  });
});
