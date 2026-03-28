import { describe, it } from 'vite-plus/test';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../../src/components/composites/alert-dialog';
import { expectDeterministicRender } from '../../determinism';

describe('AlertDialog - Determinism', () => {
  it('should render deterministic alert dialog markup', () => {
    expectDeterministicRender(() => (
      <AlertDialog defaultOpen>
        <AlertDialogTrigger>Open alert</AlertDialogTrigger>
        <AlertDialogPortal>
          <AlertDialogContent>
            <AlertDialogTitle>Alert title</AlertDialogTitle>
            <AlertDialogDescription>Alert description</AlertDialogDescription>
          </AlertDialogContent>
        </AlertDialogPortal>
      </AlertDialog>
    ));
  });
});
