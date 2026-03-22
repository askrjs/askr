import { describe, it } from 'vitest';
import { Badge } from '../../../src/components/badge';
import { expectNoAxeViolations } from '../../accessibility';

describe('Badge - Accessibility', () => {
  it('should have no automated axe violations given badge text', async () => {
    await expectNoAxeViolations(<Badge>Beta</Badge>);
  });
});
