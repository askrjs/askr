# askr-ui 1.0 Support Matrix

## Policy

askr-ui is curated as a headless component library, not a milestone tracker. A component is public only when its behavior, accessibility, types, determinism, docs, and benchmarks are coherent.

## Stable

- Foundations and form controls: `Button`, `Toggle`, `Checkbox`, `VisuallyHidden`, `Separator`, `Label`, `Input`, `Textarea`, `Field`, `RadioGroup`, `Switch`
- Focus and dismissal: `FocusRing`, `FocusScope`, `DismissableLayer`
- Overlays and selection: `Dialog`, `AlertDialog`, `Popover`, `Tooltip`, `Menu`, `DropdownMenu`, `Select`
- Disclosure and content: `Collapsible`, `Accordion`, `Tabs`
- Status and identity: `Badge`, `Avatar`, `Skeleton`, `Progress`, `ProgressCircle`, `Spinner`, `Toast`
- Basic navigation and utility: `Breadcrumb`, `Pagination`, `ToggleGroup`, `Slider`, `Menubar`, `NavigationMenu`
- Layout primitives (structural/headless only): `Container`, `Stack`, `Inline`, `Grid`, `Center`, `Spacer`, `SidebarLayout`, `TopbarLayout`

## Internal

- Shared collection, disclosure, range, overlay, focus, JSX, and prop utilities under `src/components/_internal`
- Dependency contract verification in `scripts/check-foundations-contract.js`

## Planned

- Additional primitives only after the 1.0 contract remains stable under change

## Release Gate

- `npm run build`
- `npm test`
- `npm run test:types`

No public component ships without runtime behavior tests, accessibility coverage, determinism checks, compile-time type coverage, and a benchmark entry.
