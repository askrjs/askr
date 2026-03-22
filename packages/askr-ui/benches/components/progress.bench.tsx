import { bench, describe } from 'vitest';
import { Progress, ProgressIndicator } from '../../src/components/progress';

describe('Progress benches', () => {
  bench('create progress', () => {
    Progress({
      value: 50,
      children: [ProgressIndicator({})],
    });
  });
});
