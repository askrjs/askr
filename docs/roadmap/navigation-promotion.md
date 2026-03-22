# 1.0 Navigation Promotion

## Summary

`Menubar` and `NavigationMenu` are now part of the supported public API. Their focus, submenu, dismissal, and portal-slot behavior are covered by the same gate as the rest of the library.

## Supported Navigation Surface

- `Menubar`, `MenubarMenu`, `MenubarTrigger`, `MenubarPortal`, `MenubarContent`, `MenubarItem`, `MenubarGroup`, `MenubarLabel`, `MenubarSeparator`, `MenubarSub`, `MenubarSubTrigger`, `MenubarSubContent`
- `NavigationMenu`, `NavigationMenuList`, `NavigationMenuItem`, `NavigationMenuTrigger`, `NavigationMenuContent`, `NavigationMenuLink`, `NavigationMenuViewport`, `NavigationMenuIndicator`, `NavigationMenuSub`, `NavigationMenuSubTrigger`, `NavigationMenuSubContent`

## Migration Notes

- root and subpath imports for `menubar` and `navigation-menu` are supported in `1.0.0`
- portal parts follow the tested portal-slot contract used by the runtime
- the navigation components are now part of the supported product surface
