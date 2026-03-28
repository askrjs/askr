import { describe, it } from 'vite-plus/test';
import { Spacer } from '../../../src/components/primitives/spacer/spacer';
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
