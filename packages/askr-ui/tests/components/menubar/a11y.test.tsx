import { describe, it } from 'vitest';
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarPortal,
  MenubarTrigger,
} from '../../../src/components/menubar';
import { expectNoAxeViolations } from '../../accessibility';

describe('Menubar - Accessibility', () => {
  it('should have no automated axe violations given open menubar content', async () => {
    await expectNoAxeViolations(
      <Menubar>
        <MenubarMenu value="file">
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarPortal>
            <MenubarContent>
              <MenubarItem>New</MenubarItem>
            </MenubarContent>
          </MenubarPortal>
        </MenubarMenu>
      </Menubar>
    );
  });
});
