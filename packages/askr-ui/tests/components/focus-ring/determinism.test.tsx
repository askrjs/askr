import { describe, it } from 'vitest';
import { FocusRing } from '../../../src/components/focus-ring';
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
