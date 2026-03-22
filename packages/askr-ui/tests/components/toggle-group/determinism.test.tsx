import { describe, it } from 'vitest';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '../../../src/components/toggle-group';
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
