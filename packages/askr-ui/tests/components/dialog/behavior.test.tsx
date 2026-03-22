import { afterEach, describe, expect, it } from 'vitest';
import {
  Dialog,
  DialogPortal,
  DialogContent,
  DialogTrigger,
} from '../../../src/components/dialog';
import { flushUpdates, mount, unmount } from '../../test-utils';

describe('Dialog - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    unmount(container);
  });

  it('toggles trigger expansion state when activated', async () => {
    container = mount(
      <Dialog>
        <DialogTrigger>Open dialog</DialogTrigger>
        <DialogPortal>
          <DialogContent>Body</DialogContent>
        </DialogPortal>
      </Dialog>
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
