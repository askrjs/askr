import { bench, describe } from 'vitest';
import { Spinner } from '../../src/components/spinner';

describe('Spinner benches', () => {
  bench('create spinner', () => {
    Spinner({ label: 'Loading' });
  });
});
