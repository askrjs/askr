import { describe, it } from 'vite-plus/test';
import { Separator } from '../../../src/components/primitives/separator/separator';
import { expectDeterministicRender } from '../../determinism';

describe('Separator - Determinism', () => {
  it('should render deterministic separator markup', () => {
    expectDeterministicRender(() => <Separator orientation="horizontal" />);
    expectDeterministicRender(() => <Separator decorative />);
  });
});
