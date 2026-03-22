import { describe, it } from 'vitest';
import { Skeleton } from '../../../src/components/skeleton';
import { expectDeterministicRender } from '../../determinism';

describe('Skeleton - Determinism', () => {
  it('should render deterministic skeleton markup', () => {
    expectDeterministicRender(() => <Skeleton />);
  });
});
