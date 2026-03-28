import { describe, it } from 'vite-plus/test';
import { Spacer } from '../../../src/components/primitives/spacer/spacer';
import { expectNoAxeViolations } from '../../accessibility';

describe('Spacer - Accessibility', () => {
  it('should have no automated axe violations given default flex spacer', async () => {
    await expectNoAxeViolations(
      <div style={{ display: 'flex' }}>
        <span>Left</span>
        <Spacer />
        <span>Right</span>
      </div>
    );
  });

  it('should have no automated axe violations given fixed block spacer', async () => {
    await expectNoAxeViolations(<Spacer axis="block" basis="2rem" />);
  });
});
