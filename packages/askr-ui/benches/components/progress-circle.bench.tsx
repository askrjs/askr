import { bench, describe } from 'vitest';
import {
  ProgressCircle,
  ProgressCircleIndicator,
} from '../../src/components/progress-circle';

describe('ProgressCircle benches', () => {
  bench('create progress circle', () => {
    ProgressCircle({
      value: 50,
      children: [ProgressCircleIndicator({})],
    });
  });
});
