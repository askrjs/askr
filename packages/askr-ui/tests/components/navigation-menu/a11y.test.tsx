import { describe, it } from 'vite-plus/test';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from '../../../src/components/composites/navigation-menu';
import { expectNoAxeViolations } from '../../accessibility';

describe('NavigationMenu - Accessibility', () => {
  it('should have no automated axe violations given open navigation menu content', async () => {
    await expectNoAxeViolations(
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
        <NavigationMenuViewport />
      </NavigationMenu>
    );
  });
});
