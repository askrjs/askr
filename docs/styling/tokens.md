# Styling: Tokens

Design tokens are named CSS custom properties that control the visual language of an
Askr application.

> Detailed token reference is a work in progress.

## Token categories

| Category   | Examples                                           |
| ---------- | -------------------------------------------------- |
| Color      | `--color-brand`, `--color-neutral-*`, `--color-fg` |
| Spacing    | `--spacing-xs`, `--spacing-md`, `--spacing-xl`     |
| Typography | `--font-size-sm`, `--font-weight-medium`           |
| Radius     | `--radius-sm`, `--radius-md`, `--radius-pill`      |
| Shadow     | `--shadow-sm`, `--shadow-lg`                       |

## Override tokens per-application

In `src/styles/tokens.css`:

```css
:root {
  --color-brand: #4f46e5;
  --radius-md: 6px;
}
```

Override any token without touching `askr-themes` code.

## See also

- [askr-themes](./askr-themes.md)
- [Theming](./theming.md)
