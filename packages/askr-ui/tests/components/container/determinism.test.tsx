import { describe, it } from 'vitest';
import { Container } from '../../../src/components/container/container';
import { expectDeterministicRender } from '../../determinism';

describe('Container - Determinism', () => {
  it('should render deterministic container markup', () => {
    expectDeterministicRender(() => (
      <Container maxWidth="64rem" padding="1rem">
        Content
      </Container>
    ));
    expectDeterministicRender(() => (
      <Container fluid centered size="md">
        Content
      </Container>
    ));
  });
});
