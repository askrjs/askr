import { describe, it } from 'vite-plus/test';
import { Spinner } from '../../../src/components/primitives/spinner';
import { expectNoAxeViolations } from '../../accessibility';

describe('Spinner - Accessibility', () => {
  it('should have no automated axe violations given labelled spinner', async () => {
    await expectNoAxeViolations(<Spinner label="Syncing" />);
  });
});
