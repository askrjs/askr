import { describe, it } from 'vitest';
import {
  ProgressCircle,
  ProgressCircleIndicator,
} from '../../../src/components/progress-circle';
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
