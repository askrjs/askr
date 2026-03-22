import { describe, it } from 'vitest';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from '../../../src/components/dialog';
import { expectDeterministicRender } from '../../determinism';

describe('Dialog - Determinism', () => {
  it('should render deterministic dialog markup', () => {
    expectDeterministicRender(() => (
      <Dialog defaultOpen>
        <DialogTrigger>Open dialog</DialogTrigger>
        <DialogPortal>
          <DialogContent>
            <DialogTitle>Dialog title</DialogTitle>
            <DialogDescription>Dialog description</DialogDescription>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    ));
  });
});
