import { describe, it } from 'vite-plus/test';
import { Grid } from '../../../src/components/primitives/grid/grid';
import { expectDeterministicRender } from '../../determinism';

describe('Grid - Determinism', () => {
  it('should render deterministic grid markup', () => {
    expectDeterministicRender(() => (
      <Grid columns={3} gap="1rem">
        <span>Cell</span>
      </Grid>
    ));
    expectDeterministicRender(() => <Grid columns="3" gap="0.5rem" />);
    expectDeterministicRender(() => <Grid minItemWidth="200px" autoFit />);
  });
});
