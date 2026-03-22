# askr-ui 1.0 Contract

## Overview

askr-ui is a curated headless component library. It ships behavior, ARIA semantics, controlled and uncontrolled state handling, focus management, and composition helpers without imposing styling.

## Public Contract

Public components must be coherent across:

- runtime behavior
- accessibility semantics
- compile-time types
- deterministic rerender and ID behavior
- documentation and examples
- benchmark coverage

If a component fails that bar, it does not ship as public API.

## Supported Public Surface

- Foundations and form controls: `Button`, `Toggle`, `Checkbox`, `VisuallyHidden`, `Separator`, `Label`, `Input`, `Textarea`, `Field`, `RadioGroup`, `Switch`
- Focus and dismissal: `FocusRing`, `FocusScope`, `DismissableLayer`
- Overlays and selection: `Dialog`, `AlertDialog`, `Popover`, `Tooltip`, `Menu`, `DropdownMenu`, `Select`
- Disclosure and content: `Collapsible`, `Accordion`, `Tabs`
- Status and identity: `Badge`, `Avatar`, `Skeleton`, `Progress`, `ProgressCircle`, `Spinner`, `Toast`
- Basic navigation and utility: `Breadcrumb`, `Pagination`, `ToggleGroup`, `Slider`, `Menubar`, `NavigationMenu`
- Layout primitives (structural/headless only — no colors, borders, or theme tokens): `Container`, `Stack`, `Inline`, `Grid`, `Center`, `Spacer`, `SidebarLayout`, `TopbarLayout`

- Icon foundation: `IconBase`, `IconProps`, `IconSizeToken`

Responsive theme contract:

- Layout primitives emit semantic `data-*` attributes for theming, including `data-collapse-below`, `data-columns`, `data-min-item-width`, `data-gap`, `data-sidebar-position`, and `data-sidebar-width`.
- Official themes interpret `data-collapse-below` using the canonical breakpoint names `sm`, `md`, `lg`, and `xl`.
- Responsive styling remains theme-owned and mobile first: narrow screens are the base, larger layouts layer on with additive media queries.

Icon contract:

- `IconBase` owns the canonical public icon hooks: `data-slot="icon"`, `data-icon`, semantic `data-size`, `data-decorative`, and `data-color="current"`.
- Icon sizing and stroke defaults resolve through `--ak-icon-size` and `--ak-icon-stroke-width`, with semantic theme tokens layered underneath.
- Decorative icons are `aria-hidden="true"` when unlabeled. Labeled icons render `role="img"` with a `<title>`.
- Explicit `size`, `strokeWidth`, `color`, and `style` props override theme defaults. Raw CSS sizes are consumer overrides; only `sm|md|lg|xl` participate in the shared theme contract.

## Design Rules

- Components are headless by default.
- Public state props are standardized:
  - disclosure and overlay roots use `open`, `defaultOpen`, `onOpenChange`
  - value roots use `value`, `defaultValue`, `onValueChange`
  - boolean roots use `checked`, `defaultChecked`, `onCheckedChange`
- `asChild` is allowed only on wrapper-style or interactive composition parts.
- `*Portal` parts stay public only when they perform tested, intentional portal-slot behavior.
- Internal injected props use the `__*` prefix and must be stripped before DOM props are merged.
- Shared internal helpers are preferred over component-specific state or ID patterns.

## Runtime Contract

askr-ui depends on `@askrjs/askr/foundations` exposing the verified contract used in CI:

- `Presence`
- `pressable`
- `focusable`
- `dismissable`
- `rovingFocus`
- `mergeProps`
- `composeRefs`
- `Ref`
- `Orientation`
- `controllableState`

Dependency drift is guarded by a dedicated verification script.

## Release Gate

Every public release must pass:

- `npm run lint`
- `npm run build`
- `npm test`
- `npm run test:types`

## Migration Note

`1.0.0` finalizes the library as a stable public baseline:

- milestone-era docs and deferred API language are removed
- `Menubar` and `NavigationMenu` join the supported root and subpath API
- portal parts are documented against the supported portal-slot contract used by the runtime
