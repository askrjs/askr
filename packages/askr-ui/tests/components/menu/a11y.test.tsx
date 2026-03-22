import { describe, it } from 'vitest';
import { Menu, MenuContent, MenuItem } from '../../../src/components/menu';
import { expectNoAxeViolations } from '../../accessibility';

describe('Menu - Accessibility', () => {
  it('should have no automated axe violations given open menu content', async () => {
    await expectNoAxeViolations(
      <Menu>
        <MenuContent>
          <MenuItem>One</MenuItem>
          <MenuItem>Two</MenuItem>
        </MenuContent>
      </Menu>
    );
  });
});
