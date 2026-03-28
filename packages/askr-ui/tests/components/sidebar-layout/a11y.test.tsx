import { describe, it } from 'vite-plus/test';
import { SidebarLayout } from '../../../src/components/patterns/sidebar-layout/sidebar-layout';
import { expectNoAxeViolations } from '../../accessibility';

describe('SidebarLayout - Accessibility', () => {
  it('should have no automated axe violations given sidebar and main content', async () => {
    await expectNoAxeViolations(
      <SidebarLayout sidebar={<span>Navigation</span>}>
        <p>Main content</p>
      </SidebarLayout>
    );
  });

  it('should have no automated axe violations given sidebar at end position', async () => {
    await expectNoAxeViolations(
      <SidebarLayout sidebarPosition="end" sidebar={<span>Nav</span>}>
        <p>Content</p>
      </SidebarLayout>
    );
  });
});
