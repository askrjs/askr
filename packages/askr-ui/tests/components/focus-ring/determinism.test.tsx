import { describe, it } from 'vite-plus/test';
import { FocusRing } from '../../../src/components/composites/focus-ring';
import { expectDeterministicRender } from '../../determinism';

describe('FocusRing - Determinism', () => {
  it('should render deterministic focus ring markup', () => {
    expectDeterministicRender(() => (
      <FocusRing>
        <button type="button">Focusable</button>
      </FocusRing>
    ));
  });
});
