import { afterEach, describe, expect, it } from 'vitest';
import {
  Dialog,
  DialogContent,
  DialogPortal,
  DialogTrigger,
} from '../../../src/components/dialog';
import {
  Popover,
  PopoverContent,
  PopoverPortal,
  PopoverTrigger,
} from '../../../src/components/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from '../../../src/components/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectPortal,
  SelectTrigger,
  SelectValue,
} from '../../../src/components/select';
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from '../../../src/components/tooltip';
import { flushUpdates, mount, unmount } from '../../test-utils';

describe('Consistency Reset - Portal Contract', () => {
  let container: HTMLElement;

  afterEach(() => {
    unmount(container);
  });

  it('renders retained portal content at the root sink instead of inline', async () => {
    container = mount(
      <div>
        <Dialog defaultOpen>
          <DialogPortal>
            <DialogContent>Dialog body</DialogContent>
          </DialogPortal>
          <DialogTrigger>Open dialog</DialogTrigger>
        </Dialog>
        <Popover defaultOpen>
          <PopoverPortal>
            <PopoverContent>Popover body</PopoverContent>
          </PopoverPortal>
          <PopoverTrigger>Open popover</PopoverTrigger>
        </Popover>
        <DropdownMenu defaultOpen>
          <DropdownMenuPortal>
            <DropdownMenuContent>
              <DropdownMenuItem>Archive</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
          <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        </DropdownMenu>
        <Select defaultOpen defaultValue="askr">
          <SelectPortal>
            <SelectContent>
              <SelectItem value="askr">Askr</SelectItem>
            </SelectContent>
          </SelectPortal>
          <SelectTrigger>
            <SelectValue placeholder="Choose one" />
          </SelectTrigger>
        </Select>
        <Tooltip open>
          <TooltipPortal>
            <TooltipContent>Tooltip body</TooltipContent>
          </TooltipPortal>
          <TooltipTrigger>Tooltip trigger</TooltipTrigger>
        </Tooltip>
      </div>
    );

    await flushUpdates();

    const text = container.textContent ?? '';

    expect(text.indexOf('Open dialog')).toBeLessThan(
      text.indexOf('Dialog body')
    );
    expect(text.indexOf('Open popover')).toBeLessThan(
      text.indexOf('Popover body')
    );
    expect(text.indexOf('Open menu')).toBeLessThan(text.indexOf('Archive'));
    expect(text.indexOf('Tooltip trigger')).toBeLessThan(
      text.indexOf('Tooltip body')
    );
    expect(text.indexOf('Choose one')).toBeLessThan(text.lastIndexOf('Askr'));
  });
});
