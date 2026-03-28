import { describe, it } from 'vite-plus/test';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from '../../../src/components/composites/dropdown-menu';
import { expectNoAxeViolations } from '../../accessibility';

describe('DropdownMenu - Accessibility', () => {
  it('should have no automated axe violations given open dropdown menu', async () => {
    await expectNoAxeViolations(
      <DropdownMenu defaultOpen>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent>
            <DropdownMenuItem>Archive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>
    );
  });
});
