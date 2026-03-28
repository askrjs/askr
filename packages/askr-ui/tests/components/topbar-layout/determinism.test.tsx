import { describe, it } from 'vite-plus/test';
import { TopbarLayout } from '../../../src/components/patterns/topbar-layout/topbar-layout';
import { expectDeterministicRender } from '../../determinism';

describe('TopbarLayout - Determinism', () => {
  it('should render deterministic topbar-layout markup', () => {
    expectDeterministicRender(() => (
      <TopbarLayout topbar={<span>Header</span>}>
        <p>Content</p>
      </TopbarLayout>
    ));
    expectDeterministicRender(() => (
      <TopbarLayout topbarHeight="3rem" gap="0" topbar="Nav">
        Content
      </TopbarLayout>
    ));
  });
});
