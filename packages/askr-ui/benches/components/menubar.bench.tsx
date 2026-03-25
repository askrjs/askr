import { bench, describe } from 'vite-plus/test';
import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarPortal,
  MenubarTrigger,
} from '../../src/components/menubar';

describe('Menubar benches', () => {
  bench('create menubar', () => {
    Menubar({
      children: [
        MenubarMenu({
          value: 'file',
          children: [
            MenubarTrigger({ children: 'File' }),
            MenubarPortal({
              children: [
                MenubarContent({
                  children: [MenubarItem({ children: 'New' })],
                }),
              ],
            }),
          ],
        }),
      ],
    });
  });
});
