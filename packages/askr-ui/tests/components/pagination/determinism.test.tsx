import { describe, it } from 'vite-plus/test';
import { Pagination } from '../../../src/components/composites/pagination';
import { expectDeterministicRender } from '../../determinism';

describe('Pagination - Determinism', () => {
  it('should render deterministic pagination markup', () => {
    expectDeterministicRender(() => <Pagination count={7} defaultPage={3} />);
  });
});
