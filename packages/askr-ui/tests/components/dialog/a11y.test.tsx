import { describe, it } from 'vitest';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from '../../../src/components/dialog';
import { expectNoAxeViolations } from '../../accessibility';

describe('Dialog - Accessibility', () => {
  it('should have no automated axe violations given open dialog', async () => {
    await expectNoAxeViolations(
      <Dialog defaultOpen>
        <DialogTrigger>Open dialog</DialogTrigger>
        <DialogPortal>
          <DialogContent>
            <DialogTitle>Dialog title</DialogTitle>
            <DialogDescription>Dialog description</DialogDescription>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    );
  });
});
