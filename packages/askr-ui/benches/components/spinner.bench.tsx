import { bench, describe } from 'vite-plus/test';
import { Spinner } from '../../src/components/spinner';

describe('Spinner benches', () => {
  bench('create spinner', () => {
    Spinner({ label: 'Loading' });
  });
});
