import { describe, it } from 'vite-plus/test';
import { SidebarLayout } from '../../../src/components/patterns/sidebar-layout/sidebar-layout';
import { expectDeterministicRender } from '../../determinism';

describe('SidebarLayout - Determinism', () => {
  it('should render deterministic sidebar-layout markup', () => {
    expectDeterministicRender(() => (
      <SidebarLayout sidebar={<span>Nav</span>}>
        <p>Content</p>
      </SidebarLayout>
    ));
    expectDeterministicRender(() => (
      <SidebarLayout
        sidebarPosition="end"
        sidebarWidth="20rem"
        gap="1rem"
        sidebar="Nav"
      >
        Content
      </SidebarLayout>
    ));
  });
});
