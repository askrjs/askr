import { afterEach, describe, expect, it } from 'vitest';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
} from '../../../src/components/menu';
import { mount, unmount } from '../../test-utils';

describe('Menu - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    unmount(container);
  });

  it('renders menu semantics with a single tab stop', () => {
    container = mount(
      <Menu>
        <MenuContent>
          <MenuLabel>Actions</MenuLabel>
          <MenuItem>One</MenuItem>
          <MenuSeparator />
          <MenuItem>Two</MenuItem>
        </MenuContent>
      </Menu>
    );

    const items = container.querySelectorAll('[role="menuitem"]');

    expect(items[0].getAttribute('tabindex')).toBe('0');
    expect(items[1].getAttribute('tabindex')).toBe('-1');
  });
});
