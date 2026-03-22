import { afterEach, describe, expect, it } from 'vitest';
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from '../../../src/components/tooltip';
import { flushUpdates, mount, unmount } from '../../test-utils';

describe('Tooltip - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    unmount(container);
  });

  it('updates trigger state around focus events', async () => {
    container = mount(
      <Tooltip>
        <TooltipTrigger>Hover me</TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>Helpful text</TooltipContent>
        </TooltipPortal>
      </Tooltip>
    );

    let trigger = container.querySelector('button') as HTMLButtonElement;
    trigger.focus();
    await flushUpdates();
    trigger = container.querySelector('button') as HTMLButtonElement;

    expect(trigger.getAttribute('data-state')).toBe('open');

    trigger.dispatchEvent(new PointerEvent('pointerleave'));
    await flushUpdates();
    trigger = container.querySelector('button') as HTMLButtonElement;

    expect(trigger.getAttribute('data-state')).toBe('closed');
  });
});
