# Styling: Theming

Theming in Askr means overriding design tokens and, optionally, base component styles.

> This guide is a work in progress.

## Approach

Askr applications use a layered CSS architecture:

```
reset.css         — baseline resets
tokens.css        — design tokens (from askr-themes or custom)
theme.css         — typography and global theme values
layout.css        — page/shell structure
components.css    — component-level overrides
```

Each layer can be replaced or extended independently.

## Token overrides

Override tokens in `src/styles/tokens.css`:

```css
:root {
  --color-brand: #0ea5e9;
  --radius-md: 4px;
  --font-size-base: 15px;
}
```

## Dark mode

Token overrides under a `[data-theme="dark"]` selector:

```css
[data-theme='dark'] {
  --color-bg: #0f172a;
  --color-fg: #f1f5f9;
}
```

## See also

- [Tokens](./tokens.md)
- [askr-themes](./askr-themes.md)
