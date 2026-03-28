import { describe, it } from 'vite-plus/test';
import { TopbarLayout } from '../../../src/components/patterns/topbar-layout/topbar-layout';
import { expectNoAxeViolations } from '../../accessibility';

describe('TopbarLayout - Accessibility', () => {
  it('should have no automated axe violations given topbar and main content', async () => {
    await expectNoAxeViolations(
      <TopbarLayout topbar={<span>Header</span>}>
        <p>Main content</p>
      </TopbarLayout>
    );
  });

  it('should have no automated axe violations given topbar with fixed height', async () => {
    await expectNoAxeViolations(
      <TopbarLayout topbarHeight="3rem" topbar={<span>Header</span>}>
        <p>Content</p>
      </TopbarLayout>
    );
  });
});
