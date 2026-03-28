import { describe, it } from 'vite-plus/test';
import { Spinner } from '../../../src/components/primitives/spinner';
import { expectDeterministicRender } from '../../determinism';

describe('Spinner - Determinism', () => {
  it('should render deterministic spinner markup', () => {
    expectDeterministicRender(() => <Spinner label="Syncing" />);
  });
});
