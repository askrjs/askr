import { describe, it } from 'vitest';
import { Inline } from '../../../src/components/inline/inline';
import { expectDeterministicRender } from '../../determinism';

describe('Inline - Determinism', () => {
  it('should render deterministic inline markup', () => {
    expectDeterministicRender(() => (
      <Inline gap="0.5rem" align="center" wrap="wrap">
        <span>Item</span>
      </Inline>
    ));
    expectDeterministicRender(() => <Inline collapseBelow="sm" />);
  });
});
