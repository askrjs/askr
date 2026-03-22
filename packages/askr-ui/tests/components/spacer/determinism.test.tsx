import { describe, it } from 'vitest';
import { Spacer } from '../../../src/components/spacer/spacer';
import { expectDeterministicRender } from '../../determinism';

describe('Spacer - Determinism', () => {
  it('should render deterministic spacer markup', () => {
    expectDeterministicRender(() => <Spacer />);
    expectDeterministicRender(() => <Spacer axis="inline" basis="1rem" />);
    expectDeterministicRender(() => (
      <Spacer axis="block" basis="2rem" shrink={0} />
    ));
  });
});
