import { afterEach, describe, expect, it } from 'vitest';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectPortal,
  SelectTrigger,
  SelectValue,
} from '../../../src/components/select';
import { flushUpdates, mount, unmount } from '../../test-utils';

describe('Select - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    unmount(container);
  });

  it('wires the hidden input and trigger expansion state', async () => {
    container = mount(
      <Select name="framework" defaultValue="askr">
        <SelectTrigger>
          <SelectValue placeholder="Choose one" />
        </SelectTrigger>
        <SelectPortal>
          <SelectContent>
            <SelectItem value="askr">Askr</SelectItem>
            <SelectItem value="solid">Solid</SelectItem>
          </SelectContent>
        </SelectPortal>
      </Select>
    );

    let trigger = container.querySelector('[aria-haspopup="listbox"]')!;
    const input = container.querySelector(
      'input[type="hidden"]'
    ) as HTMLInputElement;

    expect(input.value).toBe('askr');
    expect(trigger.textContent).toContain('Askr');

    trigger.click();
    await flushUpdates();
    trigger = container.querySelector('[aria-haspopup="listbox"]')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });
});
