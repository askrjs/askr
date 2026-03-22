import { describe, it } from 'vitest';
import {
  ProgressCircle,
  ProgressCircleIndicator,
} from '../../../src/components/progress-circle';
import { expectNoAxeViolations } from '../../accessibility';

describe('ProgressCircle - Accessibility', () => {
  it('should have no automated axe violations given labelled circular progress', async () => {
    await expectNoAxeViolations(
      <ProgressCircle aria-label="Sync progress" value={50} max={100}>
        <ProgressCircleIndicator />
      </ProgressCircle>
    );
  });
});
