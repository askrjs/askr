import { bench, describe } from 'vite-plus/test';
import { Pagination } from '../../src/components/pagination';

describe('Pagination benches', () => {
  bench('create pagination', () => {
    Pagination({ count: 10, defaultPage: 3 });
  });
});
