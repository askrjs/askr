import { bench, describe } from 'vite-plus/test';
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
