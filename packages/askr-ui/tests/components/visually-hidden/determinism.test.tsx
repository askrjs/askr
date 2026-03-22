import { describe, it } from 'vitest';
import { VisuallyHidden } from '../../../src/components/visually-hidden/visually-hidden';
import { expectDeterministicRender } from '../../determinism';

describe('VisuallyHidden - Determinism', () => {
  it('should render deterministic visually hidden markup', () => {
    expectDeterministicRender(() => (
      <VisuallyHidden>Hidden text</VisuallyHidden>
    ));
    expectDeterministicRender(() => (
      <VisuallyHidden asChild>
        <strong>Hidden</strong>
      </VisuallyHidden>
    ));
  });
});
