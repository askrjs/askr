import { describe, it } from 'vite-plus/test';
import { Grid } from '../../../src/components/primitives/grid/grid';
import { expectNoAxeViolations } from '../../accessibility';

describe('Grid - Accessibility', () => {
  it('should have no automated axe violations given grid with children', async () => {
    await expectNoAxeViolations(
      <Grid columns={3}>
        <span>Cell one</span>
        <span>Cell two</span>
        <span>Cell three</span>
      </Grid>
    );
  });

  it('should have no automated axe violations given auto-fit grid', async () => {
    await expectNoAxeViolations(<Grid minItemWidth="200px">Content</Grid>);
  });
});
