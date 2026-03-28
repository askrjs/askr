import { describe, it } from 'vite-plus/test';
import { Stack } from '../../../src/components/primitives/stack/stack';
import { expectDeterministicRender } from '../../determinism';

describe('Stack - Determinism', () => {
  it('should render deterministic stack markup', () => {
    expectDeterministicRender(() => (
      <Stack gap="1rem" align="center">
        <span>Item</span>
      </Stack>
    ));
    expectDeterministicRender(() => (
      <Stack justify="space-between" wrap="wrap" />
    ));
  });
});
