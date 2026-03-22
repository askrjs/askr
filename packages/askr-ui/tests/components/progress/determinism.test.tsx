import { describe, it } from 'vitest';
import { Progress, ProgressIndicator } from '../../../src/components/progress';
import { expectDeterministicRender } from '../../determinism';

describe('Progress - Determinism', () => {
  it('should render deterministic progress markup', () => {
    expectDeterministicRender(() => (
      <Progress value={25}>
        <ProgressIndicator />
      </Progress>
    ));
  });
});
