import { describe, it } from 'vitest';
import { FocusScope } from '../../../src/components/focus-scope';
import { expectDeterministicRender } from '../../determinism';

describe('FocusScope - Determinism', () => {
  it('should render deterministic focus scope markup', () => {
    expectDeterministicRender(() => (
      <FocusScope trapped loop>
        <button type="button">First</button>
        <button type="button">Second</button>
      </FocusScope>
    ));
  });
});
