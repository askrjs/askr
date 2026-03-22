import { afterEach, describe, expect, it } from 'vitest';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '../../../src/components/toggle-group';
import { TOGGLE_GROUP_A11Y_CONTRACT } from '../../../src/components/toggle-group/toggle-group.a11y';
import { flushUpdates, mount, unmount } from '../../test-utils';

function getButtonByText(
  container: HTMLElement,
  text: string
): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    (element) => element.textContent?.trim() === text
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Unable to find button with text "${text}"`);
  }

  return button;
}

describe('ToggleGroup - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    unmount(container);
  });

  it('should support single and multiple selection', async () => {
    container = mount(
      <div>
        <ToggleGroup defaultValue="left">
          <ToggleGroupItem value="left">Left</ToggleGroupItem>
          <ToggleGroupItem value="right">Right</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup type="multiple" defaultValue={['left']}>
          <ToggleGroupItem value="left">Left multiple</ToggleGroupItem>
          <ToggleGroupItem value="right">Right multiple</ToggleGroupItem>
        </ToggleGroup>
      </div>
    );

    getButtonByText(container, 'Right').click();
    await flushUpdates();

    expect(
      getButtonByText(container, 'Left').getAttribute(
        TOGGLE_GROUP_A11Y_CONTRACT.PRESSED_ATTRIBUTE
      )
    ).toBe('false');
    expect(
      getButtonByText(container, 'Right').getAttribute(
        TOGGLE_GROUP_A11Y_CONTRACT.PRESSED_ATTRIBUTE
      )
    ).toBe('true');

    getButtonByText(container, 'Right multiple').click();
    await flushUpdates();

    expect(
      getButtonByText(container, 'Left multiple').getAttribute(
        TOGGLE_GROUP_A11Y_CONTRACT.PRESSED_ATTRIBUTE
      )
    ).toBe('true');
    expect(
      getButtonByText(container, 'Right multiple').getAttribute(
        TOGGLE_GROUP_A11Y_CONTRACT.PRESSED_ATTRIBUTE
      )
    ).toBe('true');
  });
});
