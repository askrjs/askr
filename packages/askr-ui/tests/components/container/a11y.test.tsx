import { describe, it } from 'vite-plus/test';
import { Container } from '../../../src/components/primitives/container/container';
import { expectNoAxeViolations } from '../../accessibility';

describe('Container - Accessibility', () => {
  it('should have no automated axe violations given default container', async () => {
    await expectNoAxeViolations(<Container>Content</Container>);
  });

  it('should have no automated axe violations given centered fluid container', async () => {
    await expectNoAxeViolations(
      <Container centered fluid maxWidth="64rem" padding="1rem">
        Content
      </Container>
    );
  });
});
