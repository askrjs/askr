import { describe, it } from 'vite-plus/test';
import { DismissableLayer } from '../../../src/components/composites/dismissable-layer';
import { expectDeterministicRender } from '../../determinism';

describe('DismissableLayer - Determinism', () => {
  it('should render deterministic dismissable layer markup', () => {
    expectDeterministicRender(() => (
      <DismissableLayer>
        <div>Layer</div>
      </DismissableLayer>
    ));
  });
});
