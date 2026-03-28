import { describe, it } from 'vite-plus/test';
import {
  Menu,
  MenuContent,
  MenuItem,
} from '../../../src/components/composites/menu';
import { expectDeterministicRender } from '../../determinism';

describe('Menu - Determinism', () => {
  it('should render deterministic menu markup', () => {
    expectDeterministicRender(() => (
      <Menu>
        <MenuContent>
          <MenuItem>One</MenuItem>
          <MenuItem>Two</MenuItem>
        </MenuContent>
      </Menu>
    ));
  });
});
