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
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuSub,
  NavigationMenuSubContent,
  NavigationMenuSubTrigger,
  NavigationMenuTrigger,
} from '../../../src/components/composites/navigation-menu';
import { flushUpdates, mount, unmount } from '../../test-utils';

function collectInternalAttributes(root: ParentNode) {
  return Array.from(root.querySelectorAll('*')).flatMap((element) =>
    element
      .getAttributeNames()
      .filter((name) => name.startsWith('__'))
      .map((name) => ({
        element,
        name,
      }))
  );
}

describe('Consistency Reset - Internal Props', () => {
  let container: HTMLElement;

  afterEach(() => {
    unmount(container);
  });

  it('does not forward __* injected props to menubar DOM nodes', async () => {
    container = mount(
      <Menubar>
        <MenubarMenu value="file">
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarPortal>
            <MenubarContent>
              <MenubarSub value="share">
                <MenubarSubTrigger>Share</MenubarSubTrigger>
                <MenubarSubContent>
                  <MenubarItem>Email</MenubarItem>
                </MenubarSubContent>
              </MenubarSub>
            </MenubarContent>
          </MenubarPortal>
        </MenubarMenu>
      </Menubar>
    );

    (
      Array.from(document.body.querySelectorAll('button')).find(
        (element) => element.textContent?.trim() === 'File'
      ) as HTMLButtonElement
    ).click();
    await flushUpdates();
    await flushUpdates();

    (
      Array.from(document.body.querySelectorAll('button')).find(
        (element) => element.textContent?.trim() === 'Share'
      ) as HTMLButtonElement
    ).dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    await flushUpdates();
    await flushUpdates();

    expect(collectInternalAttributes(document.body)).toEqual([]);
  });

  it('does not forward __* injected props to navigation menu DOM nodes', async () => {
    container = mount(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem value="products">
            <NavigationMenuTrigger>Products</NavigationMenuTrigger>
            <NavigationMenuContent>
              <NavigationMenuSub value="more">
                <NavigationMenuSubTrigger>More</NavigationMenuSubTrigger>
                <NavigationMenuSubContent>
                  <NavigationMenuLink href="/products/pro">
                    Pro
                  </NavigationMenuLink>
                </NavigationMenuSubContent>
              </NavigationMenuSub>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    );

    (
      Array.from(document.body.querySelectorAll('button')).find(
        (element) => element.textContent?.trim() === 'Products'
      ) as HTMLButtonElement
    ).click();
    await flushUpdates();
    await flushUpdates();

    (
      Array.from(document.body.querySelectorAll('button')).find(
        (element) => element.textContent?.trim() === 'More'
      ) as HTMLButtonElement
    ).dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
    await flushUpdates();
    await flushUpdates();

    expect(collectInternalAttributes(document.body)).toEqual([]);
  });
});
