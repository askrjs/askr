import { describe, it } from 'vite-plus/test';
import { Skeleton } from '../../../src/components/primitives/skeleton';
import { expectDeterministicRender } from '../../determinism';

describe('Skeleton - Determinism', () => {
  it('should render deterministic skeleton markup', () => {
    expectDeterministicRender(() => <Skeleton />);
  });
});
