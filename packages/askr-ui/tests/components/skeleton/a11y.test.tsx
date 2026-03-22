import { describe, it } from 'vitest';
import { Skeleton } from '../../../src/components/skeleton';
import { expectNoAxeViolations } from '../../accessibility';

describe('Skeleton - Accessibility', () => {
  it('should have no automated axe violations given decorative skeleton', async () => {
    await expectNoAxeViolations(<Skeleton />);
  });
});
