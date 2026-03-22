import { describe, it } from 'vitest';
import { Spinner } from '../../../src/components/spinner';
import { expectNoAxeViolations } from '../../accessibility';

describe('Spinner - Accessibility', () => {
  it('should have no automated axe violations given labelled spinner', async () => {
    await expectNoAxeViolations(<Spinner label="Syncing" />);
  });
});
