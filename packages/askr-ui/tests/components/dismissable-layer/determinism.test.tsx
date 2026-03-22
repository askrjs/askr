import { describe, it } from 'vitest';
import { DismissableLayer } from '../../../src/components/dismissable-layer';
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
