import { describe, it } from 'vitest';
import { Badge } from '../../../src/components/badge';
import { expectDeterministicRender } from '../../determinism';

describe('Badge - Determinism', () => {
  it('should render deterministic badge markup', () => {
    expectDeterministicRender(() => <Badge>Beta</Badge>);
  });
});
