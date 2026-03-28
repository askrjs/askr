import { describe, it } from 'vite-plus/test';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectPortal,
  SelectTrigger,
  SelectValue,
} from '../../../src/components/primitives/select';
import { expectNoAxeViolations } from '../../accessibility';

describe('Select - Accessibility', () => {
  it('should have no automated axe violations given open select', async () => {
    await expectNoAxeViolations(
      <Select defaultOpen defaultValue="askr">
        <SelectTrigger aria-label="Framework">
          <SelectValue placeholder="Choose one" />
        </SelectTrigger>
        <SelectPortal>
          <SelectContent aria-label="Framework options">
            <SelectItem value="askr">Askr</SelectItem>
            <SelectItem value="solid">Solid</SelectItem>
          </SelectContent>
        </SelectPortal>
      </Select>
    );
  });
});
