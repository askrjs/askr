import { bench, describe } from 'vitest';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogPortal,
  AlertDialogTrigger,
} from '../../src/components/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogPortal,
  DialogTrigger,
} from '../../src/components/dialog';
import {
  Popover,
  PopoverContent,
  PopoverPortal,
  PopoverTrigger,
} from '../../src/components/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from '../../src/components/tooltip';

describe('Overlay benches', () => {
  bench('create Dialog tree', () => {
    Dialog({
      defaultOpen: true,
      children: (
        <>
          <DialogTrigger>Open dialog</DialogTrigger>
          <DialogPortal>
            <DialogContent>Body</DialogContent>
          </DialogPortal>
        </>
      ),
    });
  });

  bench('create AlertDialog tree', () => {
    AlertDialog({
      defaultOpen: true,
      children: (
        <>
          <AlertDialogTrigger>Open alert</AlertDialogTrigger>
          <AlertDialogPortal>
            <AlertDialogContent>Body</AlertDialogContent>
          </AlertDialogPortal>
        </>
      ),
    });
  });

  bench('create Popover tree', () => {
    Popover({
      defaultOpen: true,
      children: (
        <>
          <PopoverTrigger>Open popover</PopoverTrigger>
          <PopoverPortal>
            <PopoverContent>Body</PopoverContent>
          </PopoverPortal>
        </>
      ),
    });
  });

  bench('create Tooltip tree', () => {
    Tooltip({
      defaultOpen: true,
      children: (
        <>
          <TooltipTrigger>Help</TooltipTrigger>
          <TooltipPortal>
            <TooltipContent>Body</TooltipContent>
          </TooltipPortal>
        </>
      ),
    });
  });
});
