import { describe, it } from 'vite-plus/test';
import {
  Progress,
  ProgressIndicator,
} from '../../../src/components/primitives/progress';
import { expectNoAxeViolations } from '../../accessibility';

describe('Progress - Accessibility', () => {
  it('should have no automated axe violations given labelled progress', async () => {
    await expectNoAxeViolations(
      <Progress aria-label="Upload progress" value={25} max={100}>
        <ProgressIndicator />
      </Progress>
    );
  });
});
