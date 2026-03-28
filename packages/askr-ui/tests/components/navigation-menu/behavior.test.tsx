import { afterEach, describe, expect, it } from 'vite-plus/test';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuSub,
  NavigationMenuSubContent,
  NavigationMenuSubTrigger,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from '../../../src/components/composites/navigation-menu';
import { NAVIGATION_MENU_A11Y_CONTRACT } from '../../../src/components/composites/navigation-menu/navigation-menu.a11y';
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

describe('NavigationMenu - Behavior', () => {
  let container: HTMLElement;

  afterEach(() => {
    unmount(container);
  });

  it('updates viewport and indicator state with nested flyouts', async () => {
    container = mount(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem value="products">
            <NavigationMenuTrigger>Products</NavigationMenuTrigger>
            <NavigationMenuContent>
              <NavigationMenuLink href="/products/core">
                Core
              </NavigationMenuLink>
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
        <NavigationMenuViewport />
        <NavigationMenuIndicator />
      </NavigationMenu>
    );

    getButtonByText('Products').click();
    await flushPortalUpdates();

    expect(
      container
        .querySelector(
          `[${NAVIGATION_MENU_A11Y_CONTRACT.VIEWPORT_MARKER}="true"]`
        )
        ?.getAttribute('data-state')
    ).toBe('open');
    expect(
      container
        .querySelector(
          `[${NAVIGATION_MENU_A11Y_CONTRACT.INDICATOR_MARKER}="true"]`
        )
        ?.getAttribute('data-active-item')
    ).toBe('products');

    getButtonByText('More').dispatchEvent(
      new PointerEvent('pointerenter', { bubbles: true })
    );
    await flushPortalUpdates();

    expect(document.body.textContent).toContain('Pro');
  });

  it('supports trigger open and escape dismissal', async () => {
    container = mount(
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem value="products">
            <NavigationMenuTrigger>Products</NavigationMenuTrigger>
            <NavigationMenuContent>
              <NavigationMenuLink href="/products/core">
                Core
              </NavigationMenuLink>
            </NavigationMenuContent>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    );

    const productsTrigger = getButtonByText('Products');
    productsTrigger.click();
    await flushPortalUpdates();
    expect(document.body.textContent).toContain('Core');

    (
      document.body.querySelector(
        '[data-state="open"][data-side="bottom"]'
      ) as HTMLDivElement | null
    )?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    await flushPortalUpdates();
    expect(document.body.textContent).not.toContain('Core');
  });
});
