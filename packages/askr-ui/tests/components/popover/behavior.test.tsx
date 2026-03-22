import { afterEach, describe, expect, it } from 'vitest';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../../../src/components/popover';
import { flushUpdates, mount, unmount } from '../../test-utils';

describe('Popover - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    unmount(container);
  });

  it('toggles trigger expansion state through the trigger', async () => {
    container = mount(
      <Popover>
        <PopoverTrigger>Open popover</PopoverTrigger>
        <PopoverContent>Details</PopoverContent>
      </Popover>
    );

    let trigger = container.querySelector(
      '[aria-haspopup="dialog"]'
    ) as HTMLElement;
    trigger.click();
    await flushUpdates();
    trigger = container.querySelector(
      '[aria-haspopup="dialog"]'
    ) as HTMLElement;

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    trigger.click();
    await flushUpdates();
    trigger = container.querySelector(
      '[aria-haspopup="dialog"]'
    ) as HTMLElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('applies trigger-based dialog labeling by default', async () => {
    container = mount(
      <Popover defaultOpen>
        <PopoverTrigger>Open popover</PopoverTrigger>
        <PopoverContent>Details</PopoverContent>
      </Popover>
    );

    await flushUpdates();

    const trigger = container.querySelector('[aria-haspopup="dialog"]');
    const content = document.body.querySelector(
      '[role="dialog"]'
    ) as HTMLElement | null;

    expect(trigger).toBeTruthy();
    expect(content).toBeTruthy();
    expect(trigger?.id).toBeTruthy();
    expect(content?.getAttribute('aria-labelledby')).toBe(trigger?.id);
  });

  it('preserves explicit aria-label over automatic trigger labeling', async () => {
    container = mount(
      <Popover defaultOpen>
        <PopoverTrigger>Open popover</PopoverTrigger>
        <PopoverContent aria-label="Popover details">Details</PopoverContent>
      </Popover>
    );

    await flushUpdates();

    const content = document.body.querySelector(
      '[role="dialog"]'
    ) as HTMLElement | null;

    expect(content).toBeTruthy();
    expect(content?.getAttribute('aria-label')).toBe('Popover details');
    expect(content?.hasAttribute('aria-labelledby')).toBe(false);
  });
});
