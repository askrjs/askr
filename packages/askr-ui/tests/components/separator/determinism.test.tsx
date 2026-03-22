import { describe, it } from 'vitest';
import { Separator } from '../../../src/components/separator/separator';
import { expectDeterministicRender } from '../../determinism';

describe('Separator - Determinism', () => {
  it('should render deterministic separator markup', () => {
    expectDeterministicRender(() => <Separator orientation="horizontal" />);
    expectDeterministicRender(() => <Separator decorative />);
  });
});
