# Foundations API Reference

The `@askrjs/askr/foundations/*` subpaths hold the low-level building blocks
that sibling UI packages compose into components. Application code rarely needs
them directly; reach for `@askrjs/askr/foundations` (`layout`, `Slot`,
`Presence`, portals) first.

## `@askrjs/askr/foundations/utilities`

Prop composition and accessibility helpers. All of them are pure.

- `mergeProps(base, injected)` merges props: base values win unless
  `undefined`, and `on*` event handlers compose. Refs do not compose; use
  `composeRefs()` for that. Own string prop names, including `__proto__`, are
  preserved as data properties.
- `composeHandlers(first, second, options?)` returns one handler that runs
  `first` then `second`. It skips `second` when `first` called
  `preventDefault()`, unless `options.checkDefaultPrevented` is `false`.
- `composeRefs(...refs)` forwards one element to several refs, and
  `setRef(ref, value)` writes to a callback or object ref.
- `ariaDisabled(disabled)`, `ariaExpanded(expanded)`, and
  `ariaSelected(selected)` return a spreadable object with the matching
  `aria-*` attribute. `ariaDisabled` omits the attribute when `disabled` is
  falsy; the other two omit it when the value is `undefined`.
- `formatId({ id, prefix? })` builds a deterministic, SSR-safe element ID from a
  caller-provided identity. It never generates random or sequential IDs.

```ts
import {
  ariaExpanded,
  composeHandlers,
  formatId,
} from '@askrjs/askr/foundations/utilities';

const panelId = formatId({ prefix: 'faq', id: 3 });
const onClick = composeHandlers(
  (event: Event) => event.preventDefault(),
  () => console.log('never runs: the first handler prevented default')
);
const expanded = ariaExpanded(true); // { 'aria-expanded': 'true' }
```

## `@askrjs/askr/foundations/interactions`

Interaction policy for sibling UI packages. Components apply these helpers
instead of implementing press, focus, or hover handling themselves.

- `applyInteractionPolicy({ isNative, disabled, onPress, ref? })` is the single
  entry point for press behavior. Native elements get `disabled`; non-native
  elements get `role="button"`, `tabIndex`, `aria-disabled`, and Enter/Space
  keyboard activation.
- `mergeInteractionProps(child, policy, user)` merges policy props with child
  and user props; the policy owns `disabled`, and handlers run policy, then
  user, then child.
- `pressable({ disabled?, onPress?, isNativeButton? })` returns click and
  keyboard props implementing press semantics.
- `focusable({ disabled?, tabIndex? })` returns `tabIndex` and `aria-disabled`
  for a focusable host.
- `hoverable({ disabled?, onEnter?, onLeave? })` returns pointer enter and leave
  handlers, or none when disabled.
- `rovingFocus({ currentIndex, itemCount, orientation?, loop?, onNavigate?,
isDisabled? })` implements arrow-key roving `tabindex`. It returns
  `container` props and an `item(index)` function for each item's props.
- `dismissable(options)` handles Escape and outside-pointer dismissal.

## `@askrjs/askr/foundations/state`

Controlled/uncontrolled value helpers.

- `controllableState({ value, defaultValue, onChange? })` returns a getter with
  `.set()` and `isControlled`. It defers to `value` when the parent controls
  it, and destructures like `state()`:
  `const [value, setValue] = controllableState(options)`. The getter is
  readable like a `state()` getter, so `{() => value}` renders its value, and an
  updater passed to the setter runs once.
- `isControlled(value)` is `true` when `value` is not `undefined`.
- `resolveControllable(value, defaultValue)` returns the effective
  `{ value, isControlled }`.
- `makeControllable({ value, defaultValue, onChange?, setInternal? })` returns
  a `set` function that calls `onChange` when controlled, or updates internal
  state and then calls `onChange` when uncontrolled.

## `@askrjs/askr/foundations/structures`

- `createCollection()` returns an insertion-ordered registry of items that
  components register into. Registering the same node replaces its metadata
  without changing its order. Each unregister callback removes only its own
  registration, so cleanup from an earlier registration cannot remove a newer
  one, including after `clear()`.
- `createLayer()` returns a `LayerManager` that tracks stacked overlays, so only
  the top layer handles Escape and outside-pointer dismissal.
- `isElement(value)` checks for a JSX element, and
  `cloneElement(element, props)` copies one with `props` shallow-merged over
  its own.
- `layout()`, `definePortal()`, `Portal`, `DefaultPortal`, `Slot`, and
  `Presence` are also exported here, the same as from
  `@askrjs/askr/foundations`; see the [API overview](./api.md).

## `@askrjs/askr/foundations/icon`

The icon contract that generated icon packages render through.

- `IconBase` is the `<svg>` wrapper. It accepts `size`, `strokeWidth`, `color`,
  `title`, `class`, `style`, and `iconName`, plus normal SVG props. A `title`
  makes the icon labelled; without one it is `aria-hidden`.

  Size-token resolution and SVG attribute construction are implementation
  details of `IconBase`; generated icon packages should compose through
  `IconBase` rather than depend on those helpers.

## Related

- [API overview](./api.md)
- [Foundations pit of success](../internals/foundations-pit-of-success.md)
