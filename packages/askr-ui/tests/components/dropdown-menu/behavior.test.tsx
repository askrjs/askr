import { afterEach, describe, expect, it } from 'vite-plus/test';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from '../../../src/components/composites/dropdown-menu';
import { flushUpdates, mount, unmount } from '../../test-utils';

describe('DropdownMenu - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    unmount(container);
  });

  it('toggles trigger expansion state when activated', async () => {
    container = mount(
      <DropdownMenu>
        <DropdownMenuTrigger>Open menu</DropdownMenuTrigger>
        <DropdownMenuPortal>
          <DropdownMenuContent>
            <DropdownMenuItem>Archive</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenuPortal>
      </DropdownMenu>
    );

    let trigger = container.querySelector(
      '[aria-haspopup="menu"]'
    ) as HTMLButtonElement;
    trigger.click();
    await flushUpdates();
    trigger = container.querySelector(
      '[aria-haspopup="menu"]'
    ) as HTMLButtonElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    trigger.click();
    await flushUpdates();
    trigger = container.querySelector(
      '[aria-haspopup="menu"]'
    ) as HTMLButtonElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});
