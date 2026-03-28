# @askrjs/askr-lucide

Thin Askr wrappers for the [Lucide](https://lucide.dev) SVG icon set.

## Install

```bash
npm install @askrjs/askr-lucide
```

Requires `@askrjs/askr` as a peer dependency.

## Usage

```tsx
import { SearchIcon, XIcon, MenuIcon } from '@askrjs/askr-lucide';

function App() {
  return (
    <div>
      <SearchIcon />
      <XIcon size={16} />
      <MenuIcon color="blue" strokeWidth={1.5} />
    </div>
  );
}
```

### All props

| Prop          | Type     | Default        | Description                                        |
| ------------- | -------- | -------------- | -------------------------------------------------- | ----------------------------------------------------- |
| `size`        | `number  | string`        | `20`                                               | Width and height of the svg                           |
| `strokeWidth` | `number` | `2`            | SVG stroke width                                   |
| `color`       | `string` | `currentColor` | SVG stroke color                                   |
| `class`       | `string` | -              | CSS class applied to the svg element               |
| `title`       | `string` | -              | Accessible title; also removes `aria-hidden`       |
| `style`       | `string  | object`        | -                                                  | Inline styles merged with the icon contract variables |
| `...rest`     | -        | -              | Any other prop is forwarded to the `<svg>` element |

### Theme contract

Every generated icon emits a stable public theming surface on the root `<svg>`:

- `data-slot="icon"`
- `data-icon="<IconName>"`
- `data-size="sm|md|lg|xl"` when a semantic named size is used
- `data-decorative="true"` when no `title` is provided
- `data-color="current"` when the icon uses inherited `currentColor`

Icons also resolve size and stroke width through CSS custom properties:

- `--ak-icon-size`
- `--ak-icon-stroke-width`

The icon contract itself is owned by `@askrjs/askr/foundations`. Official themes are expected to provide the semantic token layer behind those variables, for example `--ak-icon-size-sm` or `--ak-icon-stroke-width-md`.

## Accessibility

By default every icon renders with `aria-hidden="true"` so it is invisible to screen readers and you are responsible for providing context via surrounding text.

To make an icon meaningful on its own, pass a `title` prop:

```tsx
<SearchIcon title="Search" />
```

This removes `aria-hidden` and renders a `<title>` element inside the SVG, making it readable by assistive technology.

## Tree shaking

Each icon is a named export. Import only what you use:

```tsx
// Only SearchIcon is included in your bundle
import { SearchIcon } from '@askrjs/askr-lucide';

// Deep import, same effect, explicit path
import { SearchIcon } from '@askrjs/askr-lucide/icons/search';
```

The package is marked `"sideEffects": false` and built with `preserveModules`, so bundlers can eliminate unused icons completely.

## Philosophy

This package is a binding layer, not an icon framework. It does not:

- provide a string-based `<Icon name="x" />` API
- ship a runtime icon registry
- depend on Lucide at runtime

`createIcon` is a thin adapter over `@askrjs/askr/foundations`' `IconBase`. It closes over static SVG node data and returns a plain Askr component function that implements the shared icon contract. Each icon is a direct named export, nothing more.
