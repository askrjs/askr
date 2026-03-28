import { describe, it } from 'vite-plus/test';
import {
  ProgressCircle,
  ProgressCircleIndicator,
} from '../../../src/components/primitives/progress-circle';
import { expectDeterministicRender } from '../../determinism';

describe('ProgressCircle - Determinism', () => {
  it('should render deterministic circular progress markup', () => {
    expectDeterministicRender(() => (
      <ProgressCircle value={60}>
        <ProgressCircleIndicator />
      </ProgressCircle>
    ));
  });
});
