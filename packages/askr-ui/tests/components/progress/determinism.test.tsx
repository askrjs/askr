import { describe, it } from 'vite-plus/test';
import {
  Progress,
  ProgressIndicator,
} from '../../../src/components/primitives/progress';
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
