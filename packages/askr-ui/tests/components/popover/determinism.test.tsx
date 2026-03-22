import { describe, it } from 'vitest';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../../src/components/popover';
import { expectDeterministicRender } from '../../determinism';

describe('Popover - Determinism', () => {
  it('should render deterministic popover markup', () => {
    expectDeterministicRender(() => (
      <Popover defaultOpen>
        <PopoverTrigger>Open popover</PopoverTrigger>
        <PopoverContent>Popover body</PopoverContent>
      </Popover>
    ));
  });
});
