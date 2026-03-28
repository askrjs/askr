import { describe, it } from 'vite-plus/test';
import { Badge } from '../../../src/components/primitives/badge';
import { expectNoAxeViolations } from '../../accessibility';

describe('Badge - Accessibility', () => {
  it('should have no automated axe violations given badge text', async () => {
    await expectNoAxeViolations(<Badge>Beta</Badge>);
  });
});
