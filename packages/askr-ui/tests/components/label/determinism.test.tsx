import { describe, it } from 'vite-plus/test';
import { Label } from '../../../src/components/primitives/label/label';
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
