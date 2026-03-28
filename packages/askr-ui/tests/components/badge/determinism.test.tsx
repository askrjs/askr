import { describe, it } from 'vite-plus/test';
import { Badge } from '../../../src/components/primitives/badge';
import { expectDeterministicRender } from '../../determinism';

describe('Badge - Determinism', () => {
  it('should render deterministic badge markup', () => {
    expectDeterministicRender(() => <Badge>Beta</Badge>);
  });
});
