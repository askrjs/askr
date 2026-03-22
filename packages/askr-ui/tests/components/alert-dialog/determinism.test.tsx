import { describe, it } from 'vitest';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../../src/components/alert-dialog';
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
