import { describe, it } from 'vitest';
import { Label } from '../../../src/components/label/label';
import { expectDeterministicRender } from '../../determinism';

describe('Label - Determinism', () => {
  it('should render deterministic label markup', () => {
    expectDeterministicRender(() => <Label htmlFor="email">Email</Label>);
    expectDeterministicRender(() => (
      <Label asChild data-testid="composed-label">
        <span>Email</span>
      </Label>
    ));
  });
});
