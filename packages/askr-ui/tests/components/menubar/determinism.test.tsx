import { describe, it } from 'vitest';
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarPortal,
  MenubarTrigger,
} from '../../../src/components/menubar';
import { expectDeterministicRender } from '../../determinism';

describe('Menubar - Determinism', () => {
  it('should render deterministic menubar markup', () => {
    expectDeterministicRender(() => (
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
    ));
  });
});
