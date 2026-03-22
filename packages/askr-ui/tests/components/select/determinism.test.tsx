import { describe, it } from 'vitest';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectPortal,
  SelectTrigger,
  SelectValue,
} from '../../../src/components/select';
import { expectDeterministicRender } from '../../determinism';

describe('Select - Determinism', () => {
  it('should render deterministic select markup', () => {
    expectDeterministicRender(() => (
      <Select defaultOpen defaultValue="askr">
        <SelectTrigger>
          <SelectValue placeholder="Choose one" />
        </SelectTrigger>
        <SelectPortal>
          <SelectContent>
            <SelectItem value="askr">Askr</SelectItem>
            <SelectItem value="solid">Solid</SelectItem>
          </SelectContent>
        </SelectPortal>
      </Select>
    ));
  });
});
