import { bench, describe } from 'vitest';
import { Badge } from '../../src/components/badge';

describe('Badge benches', () => {
  bench('create badge', () => {
    Badge({ children: 'Beta' });
  });
});
