import { describe, it } from 'vite-plus/test';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '../../../src/components/primitives/toggle-group';
import { expectDeterministicRender } from '../../determinism';

describe('ToggleGroup - Determinism', () => {
  it('should render deterministic toggle group markup', () => {
    expectDeterministicRender(() => (
      <ToggleGroup defaultValue="left">
        <ToggleGroupItem value="left">Left</ToggleGroupItem>
      </ToggleGroup>
    ));
  });
});
