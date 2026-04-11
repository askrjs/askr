# Styling: askr-themes

`@askrjs/askr-themes` provides visual defaults for Askr applications.

## What askr-themes is

askr-themes is an optional styling layer. It provides:

- Design tokens (CSS custom properties)
- Base component styles that pair with `askr-ui`
- Layout utility classes

It does not include runtime behavior or component logic.

## Installation

```bash
npm install @askrjs/askr-themes
```

Import once at your app entry point:

```ts
import '@askrjs/askr-themes/default';
```

Or in CSS:

```css
@import '@askrjs/askr-themes/default';
```

## When to use askr-themes

Use `askr-themes` when you want the standard Askr visual language without writing your own
design token layer.

Skip `askr-themes` when you have your own design system. `askr-ui` components work without
`askr-themes` — supply your own CSS.

## See also

- [Tokens](./tokens.md)
- [Theming](./theming.md)
- [UI: askr-ui](../ui/askr-ui.md)
