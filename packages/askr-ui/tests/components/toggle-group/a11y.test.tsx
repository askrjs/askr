import { describe, it } from 'vite-plus/test';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '../../../src/components/primitives/toggle-group';
import { expectNoAxeViolations } from '../../accessibility';

describe('ToggleGroup - Accessibility', () => {
  it('should have no automated axe violations given a two-item toggle group', async () => {
    await expectNoAxeViolations(
      <ToggleGroup defaultValue="left">
        <ToggleGroupItem value="left">Left</ToggleGroupItem>
        <ToggleGroupItem value="right">Right</ToggleGroupItem>
      </ToggleGroup>
    );
  });
});
