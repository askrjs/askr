import { describe, it } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from '../../../src/components/dropdown-menu';
import { expectDeterministicRender } from '../../determinism';

describe('DropdownMenu - Determinism', () => {
  it('should render deterministic dropdown menu markup', () => {
    expectDeterministicRender(() => (
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent>
            <DropdownMenuItem>Archive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>
    ));
  });
});
