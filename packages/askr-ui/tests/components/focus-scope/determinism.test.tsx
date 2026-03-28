import { describe, it } from 'vite-plus/test';
import { FocusScope } from '../../../src/components/composites/focus-scope';
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
