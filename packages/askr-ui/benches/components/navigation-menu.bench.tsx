import { bench, describe } from 'vitest';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '../../src/components/navigation-menu';

describe('NavigationMenu benches', () => {
  bench('create navigation menu', () => {
    NavigationMenu({
      children: [
        NavigationMenuList({
          children: [
            NavigationMenuItem({
              value: 'products',
              children: [
                NavigationMenuTrigger({ children: 'Products' }),
                NavigationMenuContent({
                  children: [
                    NavigationMenuLink({
                      href: '/products/core',
                      children: 'Core',
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });
  });
});
