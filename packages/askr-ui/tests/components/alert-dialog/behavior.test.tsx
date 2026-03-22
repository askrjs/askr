import { afterEach, describe, expect, it } from 'vitest';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogPortal,
  AlertDialogTrigger,
} from '../../../src/components/alert-dialog';
import { flushUpdates, mount, unmount } from '../../test-utils';

describe('AlertDialog - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    unmount(container);
  });

  it('toggles trigger expansion state when activated', async () => {
    container = mount(
      <AlertDialog>
        <AlertDialogTrigger>Open alert</AlertDialogTrigger>
        <AlertDialogPortal>
          <AlertDialogContent>Confirm action</AlertDialogContent>
        </AlertDialogPortal>
      </AlertDialog>
    );

    let trigger = container.querySelector('[aria-haspopup="dialog"]')!;
    trigger.click();
    await flushUpdates();
    trigger = container.querySelector('[aria-haspopup="dialog"]')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    trigger.click();
    await flushUpdates();
    trigger = container.querySelector('[aria-haspopup="dialog"]')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});
