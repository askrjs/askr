import { afterEach, describe, expect, it } from 'vite-plus/test';
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarPortal,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '../../../src/components/composites/menubar';
import { MENUBAR_A11Y_CONTRACT } from '../../../src/components/composites/menubar/menubar.a11y';
import { flushUpdates, mount, unmount } from '../../test-utils';

function getButtonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll('button')).find(
    (element) => element.textContent?.trim() === text
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Unable to find button with text "${text}"`);
  }

  return button;
}

async function flushPortalUpdates() {
  await flushUpdates();
  await flushUpdates();
  await flushUpdates();
}

describe('Menubar - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    unmount(container);
  });

  it('switches open state between top-level triggers and nested submenus', async () => {
    container = mount(
      <Menubar>
        <MenubarMenu value="file">
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarPortal>
            <MenubarContent>
              <MenubarItem>New</MenubarItem>
              <MenubarSub value="share">
                <MenubarSubTrigger>Share</MenubarSubTrigger>
                <MenubarSubContent>
                  <MenubarItem>Email</MenubarItem>
                </MenubarSubContent>
              </MenubarSub>
            </MenubarContent>
          </MenubarPortal>
        </MenubarMenu>
        <MenubarMenu value="edit">
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarPortal>
            <MenubarContent>
              <MenubarItem>Cut</MenubarItem>
            </MenubarContent>
          </MenubarPortal>
        </MenubarMenu>
      </Menubar>
    );

    getButtonByText('File').click();
    await flushPortalUpdates();

    expect(document.body.textContent).toContain('New');

    getButtonByText('Edit').dispatchEvent(
      new PointerEvent('pointerenter', { bubbles: true })
    );
    await flushPortalUpdates();

    expect(document.body.textContent).toContain('Cut');

    getButtonByText('File').click();
    await flushPortalUpdates();

    getButtonByText('Share').dispatchEvent(
      new PointerEvent('pointerenter', { bubbles: true })
    );
    await flushPortalUpdates();

    expect(document.body.textContent).toContain('Email');
  });

  it('supports keyboard opening and escape dismissal', async () => {
    container = mount(
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

    const fileTrigger = getButtonByText('File');
    fileTrigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })
    );
    await flushPortalUpdates();
    expect(document.body.textContent).toContain('New');

    (
      document.body.querySelector(
        `[role="${MENUBAR_A11Y_CONTRACT.CONTENT_ROLE}"]`
      ) as HTMLDivElement
    ).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    await flushPortalUpdates();
    expect(document.body.textContent).not.toContain('New');
  });
});
