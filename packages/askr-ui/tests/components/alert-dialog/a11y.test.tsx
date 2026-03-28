import { describe, it } from 'vite-plus/test';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../../src/components/composites/alert-dialog';
import { expectNoAxeViolations } from '../../accessibility';

describe('AlertDialog - Accessibility', () => {
  it('should have no automated axe violations given open alert dialog', async () => {
    await expectNoAxeViolations(
      <AlertDialog defaultOpen>
        <AlertDialogTrigger>Open alert</AlertDialogTrigger>
        <AlertDialogPortal>
          <AlertDialogContent>
            <AlertDialogTitle>Alert title</AlertDialogTitle>
            <AlertDialogDescription>Alert description</AlertDialogDescription>
          </AlertDialogContent>
        </AlertDialogPortal>
      </AlertDialog>
    );
  });
});
