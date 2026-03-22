import { describe, it } from 'vitest';
import { Pagination } from '../../../src/components/pagination';
import { expectDeterministicRender } from '../../determinism';

describe('Pagination - Determinism', () => {
  it('should render deterministic pagination markup', () => {
    expectDeterministicRender(() => <Pagination count={7} defaultPage={3} />);
  });
});
