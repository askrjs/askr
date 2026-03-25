import { bench, describe } from 'vite-plus/test';
import { Progress, ProgressIndicator } from '../../src/components/progress';

describe('Progress benches', () => {
  bench('create progress', () => {
    Progress({
      value: 50,
      children: [ProgressIndicator({})],
    });
  });
});
