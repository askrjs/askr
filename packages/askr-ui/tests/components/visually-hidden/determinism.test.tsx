import { describe, it } from 'vite-plus/test';
import { VisuallyHidden } from '../../../src/components/primitives/visually-hidden/visually-hidden';
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
