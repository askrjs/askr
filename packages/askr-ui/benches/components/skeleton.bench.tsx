import { bench, describe } from 'vitest';
import { Skeleton } from '../../src/components/skeleton';

describe('Skeleton benches', () => {
  bench('create skeleton', () => {
    Skeleton({});
  });
});
