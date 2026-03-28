import { describe, it } from 'vite-plus/test';
import { DismissableLayer } from '../../../src/components/composites/dismissable-layer';
import { expectNoAxeViolations } from '../../accessibility';

describe('DismissableLayer - Accessibility', () => {
  it('should have no automated axe violations given interactive content', async () => {
    await expectNoAxeViolations(
      <DismissableLayer>
        <button type="button">Layer action</button>
      </DismissableLayer>
    );
  });
});
