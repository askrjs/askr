import { bench, describe } from 'vite-plus/test';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from '../../src/components/dropdown-menu';
import { Menu, MenuContent, MenuItem } from '../../src/components/menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectPortal,
  SelectTrigger,
  SelectValue,
} from '../../src/components/select';

describe('Menu and Select benches', () => {
  bench('create Menu tree', () => {
    Menu({
      children: (
        <MenuContent>
          <MenuItem>One</MenuItem>
          <MenuItem>Two</MenuItem>
        </MenuContent>
      ),
    });
  });

  bench('create DropdownMenu tree', () => {
    DropdownMenu({
      defaultOpen: true,
      children: (
        <>
          <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent>
              <DropdownMenuItem>Archive</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </>
      ),
    });
  });

  bench('create Select tree', () => {
    Select({
      defaultOpen: true,
      defaultValue: 'askr',
      children: (
        <>
          <SelectTrigger>
            <SelectValue placeholder="Choose one" />
          </SelectTrigger>
          <SelectPortal>
            <SelectContent>
              <SelectItem value="askr">Askr</SelectItem>
              <SelectItem value="solid">Solid</SelectItem>
            </SelectContent>
          </SelectPortal>
        </>
      ),
    });
  });
});
