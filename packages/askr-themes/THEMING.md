# Theming

Import a theme:

```css
@import '@askrjs/askr-themes/default';
```

Pick a mode on an ancestor:

```html
<html data-theme="light"></html>
<html data-theme="dark"></html>
```

Token override:

```css
:root {
  --ak-color-primary: purple;
  --ak-radius-md: 12px;
}
```

Style override:

```css
[data-slot='button'][data-variant='primary'] {
  background: black;
}
```

Icon override:

```css
[data-slot='icon'][data-size='sm'] {
  --ak-icon-size-sm: 0.875rem;
  --ak-icon-stroke-width-sm: 1.5;
}
```

Rules: style only public data-\* hooks, never internal DOM, no deep selectors, no !important.

Responsive rules:

- Build mobile first. Base selectors must work on narrow screens; larger layouts are additive via `min-width` media queries.
- Official themes use semantic breakpoints `sm`, `md`, `lg`, and `xl` for `data-collapse-below`.
- Keep breakpoint values centralized in theme tokens so default and generated themes stay aligned.
- Responsive behavior must target only public hooks such as `data-collapse-below`, `data-columns`, `data-min-item-width`, `data-gap`, `data-sidebar-position`, and `data-sidebar-width`.
- Prefer token overrides first. Reach for component CSS overrides only when tokens are insufficient.
- Keep selectors low-specificity so a custom theme can override a rule with one equally specific selector. `:where(...)` is preferred for official theme baselines.
- Broad layout slots like `main`, `sidebar`, and `navbar` must always be anchored to a public layout root such as `topbar-layout` or `sidebar-layout`.
- Named layout hooks such as `data-size`, `data-max-width`, `data-padding`, `data-gap`, and `data-sidebar-width` are part of the public theme contract and should resolve through theme tokens rather than hard-coded values.
- Icons are part of the public theme contract. `@askrjs/askr-ui` owns the canonical icon hooks, and official icon wrappers should implement that contract by emitting `data-slot="icon"`, `data-icon`, semantic `data-size`, and `data-decorative` so themes can style them uniformly across icon sets.
- Icon size and stroke defaults should resolve through the shared icon tokens: `--ak-icon-size-sm|md|lg|xl` and `--ak-icon-stroke-width-sm|md|lg|xl`.

## Token Contract

Version: 1.0 draft

This document defines the official theme token contract for `askr-themes`.

The purpose of this token set is to provide a stable, reusable semantic theming layer for:

- `askr-ui` headless components
- application shell layouts
- docs layouts
- admin dashboards
- forms
- tables
- navigation
- overlays and interactive surfaces

This contract is intentionally semantic, not component-specific.

---

## Goals

The token system must:

- support both light and dark themes
- theme headless UI primitives consistently
- avoid hardcoded component styling
- provide enough semantic coverage for real apps
- remain small enough to be maintainable
- separate visual tokens from component implementation

---

## Non-Goals

This spec does not:

- define component-specific tokens for every widget
- mandate one visual style
- require every theme to look the same
- require all apps to use every token directly

---

## Design Principles

1. Prefer semantic tokens over raw visual tokens.
2. Prefer a restrained, reusable token set over many one-off tokens.
3. Tokens must be usable across admin UI, docs UI, and marketing-adjacent app surfaces.
4. `askr-ui` components should consume semantic tokens, not hardcoded values.
5. Theme blocks should only override theme-dependent values.
6. Layout, spacing, typography scale, icon scale, and breakpoints belong in the global root unless intentionally themed.

---

## Token Layers

The token contract is split into these layers:

1. Color semantics
2. Typography
3. Spacing
4. Radius
5. Borders
6. Shadows
7. Focus
8. Motion
9. Icons
10. Layout
11. Z-index

---

## Naming Rules

All official tokens use the `--ak-` prefix.

Categories:

- `--ak-color-*`
- `--ak-font-*`
- `--ak-space-*`
- `--ak-radius-*`
- `--ak-border-*`
- `--ak-shadow-*`
- `--ak-focus-*`
- `--ak-duration-*`
- `--ak-ease-*`
- `--ak-icon-*`
- `--ak-breakpoint-*`
- `--ak-layout-*`
- `--ak-z-*`

Rules:

- Use `text` instead of `fg`
- Use `text-muted` instead of generic `muted`
- Use `surface` for UI surfaces
- Use `bg` only for the global app background
- Use `soft` for low-emphasis tinted backgrounds
- Use `ink` for readable foreground color placed on a soft/status background
- Use `subtle`, `default`, and `strong` when a three-step ladder is needed
- Use `hover`, `active`, `selected`, and `disabled` for interaction semantics

---

## Required Tokens

### 1. Color Tokens

These are required for every theme.

#### Brand / Accent

- `--ak-color-primary`
- `--ak-color-primary-hover`
- `--ak-color-primary-active`
- `--ak-color-primary-soft`
- `--ak-color-primary-ink`

#### Text

- `--ak-color-text`
- `--ak-color-text-muted`
- `--ak-color-text-subtle`
- `--ak-color-text-inverse`

#### Background / Surface

- `--ak-color-bg`
- `--ak-color-surface`
- `--ak-color-surface-muted`
- `--ak-color-surface-raised`
- `--ak-color-surface-overlay`

#### Borders

- `--ak-color-border-subtle`
- `--ak-color-border`
- `--ak-color-border-strong`

#### Status

- `--ak-color-success`
- `--ak-color-success-soft`
- `--ak-color-success-ink`
- `--ak-color-warning`
- `--ak-color-warning-soft`
- `--ak-color-warning-ink`
- `--ak-color-danger`
- `--ak-color-danger-soft`
- `--ak-color-danger-ink`
- `--ak-color-info`
- `--ak-color-info-soft`
- `--ak-color-info-ink`

#### Links / Focus / Selection / Disabled / Overlay

- `--ak-color-link`
- `--ak-color-link-hover`
- `--ak-color-focus-ring`
- `--ak-color-disabled-bg`
- `--ak-color-disabled-surface`
- `--ak-color-disabled-border`
- `--ak-color-disabled-text`
- `--ak-color-selected`
- `--ak-color-selected-border`
- `--ak-color-hover`
- `--ak-color-active`
- `--ak-color-backdrop`

---

### 2. Typography Tokens

Required:

- `--ak-font-family-body`
- `--ak-font-family-mono`
- `--ak-font-size-xs`
- `--ak-font-size-sm`
- `--ak-font-size-md`
- `--ak-font-size-lg`
- `--ak-font-size-xl`
- `--ak-font-size-2xl`
- `--ak-font-size-heading`
- `--ak-font-size-display`
- `--ak-font-weight-regular`
- `--ak-font-weight-medium`
- `--ak-font-weight-semibold`
- `--ak-font-weight-bold`
- `--ak-line-height-tight`
- `--ak-line-height-normal`
- `--ak-line-height-relaxed`

---

### 3. Spacing Tokens

Required:

- `--ak-space-xs`
- `--ak-space-sm`
- `--ak-space-md`
- `--ak-space-lg`
- `--ak-space-xl`
- `--ak-space-2xl`
- `--ak-space-3xl`

---

### 4. Radius Tokens

Required:

- `--ak-radius-sm`
- `--ak-radius-md`
- `--ak-radius-lg`
- `--ak-radius-xl`
- `--ak-radius-round`

---

### 5. Border Tokens

Required:

- `--ak-border-width-sm`
- `--ak-border-width-md`

---

### 6. Shadow Tokens

Required:

- `--ak-shadow-sm`
- `--ak-shadow-md`
- `--ak-shadow-lg`

Themes may keep shadows extremely subtle, but they must still provide these tokens.

---

### 7. Focus Tokens

Required:

- `--ak-focus-ring-width`
- `--ak-focus-ring-offset`

---

### 8. Motion Tokens

Required:

- `--ak-duration-fast`
- `--ak-duration-normal`
- `--ak-duration-slow`
- `--ak-ease-standard`

---

### 9. Icon Tokens

Required:

- `--ak-icon-size-sm`
- `--ak-icon-size-md`
- `--ak-icon-size-lg`
- `--ak-icon-size-xl`
- `--ak-icon-stroke-width-sm`
- `--ak-icon-stroke-width-md`
- `--ak-icon-stroke-width-lg`
- `--ak-icon-stroke-width-xl`

---

### 10. Layout Tokens

Required:

- `--ak-breakpoint-sm`
- `--ak-breakpoint-md`
- `--ak-breakpoint-lg`
- `--ak-breakpoint-xl`
- `--ak-layout-navbar-height`
- `--ak-layout-sidebar-width-sm`
- `--ak-layout-sidebar-width-md`
- `--ak-layout-sidebar-width-lg`
- `--ak-layout-sidebar-width-xl`
- `--ak-layout-sidebar-width`
- `--ak-layout-content-max-width`
- `--ak-layout-page-gutter`
- `--ak-layout-panel-padding`

---

### 11. Z-Index Tokens

Required:

- `--ak-z-dropdown`
- `--ak-z-sticky`
- `--ak-z-fixed`
- `--ak-z-modal-backdrop`
- `--ak-z-modal`
- `--ak-z-popover`
- `--ak-z-toast`
- `--ak-z-tooltip`

---

## Optional Tokens

These may be added later if justified by real usage, but are not part of the minimum required contract:

- `--ak-color-link-visited`
- `--ak-color-selection`
- `--ak-color-selection-text`
- `--ak-shadow-xl`
- `--ak-duration-instant`
- `--ak-ease-emphasized`
- `--ak-layout-header-blur`
- `--ak-border-width-lg`

Do not add optional tokens until there is a clear cross-component need.

---

## Global vs Theme-Scoped Tokens

### Global root tokens

These should normally be defined once in `:root`:

- typography scale
- spacing scale
- radius scale
- border widths
- shadow scale
- focus ring dimensions
- motion values
- icon scale
- breakpoints
- layout sizes
- z-index layers

### Theme-scoped tokens

These should normally be defined per theme:

- all color tokens
- `color-scheme`

A theme may override non-color tokens only when the design intentionally changes them.

---

## Required Consumption Rules for askr-ui

`askr-ui` must consume semantic tokens, not raw colors or app-specific styling.

### Correct usage examples

Button:

- background uses `--ak-color-primary`
- hover uses `--ak-color-primary-hover`
- active uses `--ak-color-primary-active`
- focus uses `--ak-color-focus-ring`
- disabled styles use disabled tokens

Card:

- background uses `--ak-color-surface`
- border uses `--ak-color-border`
- raised card may use `--ak-color-surface-raised`

Muted text:

- use `--ak-color-text-muted`

Selected nav item:

- background uses `--ak-color-selected`
- border or indicator uses `--ak-color-selected-border`

Status badge:

- success badge uses `success`, `success-soft`, `success-ink`
- warning badge uses `warning`, `warning-soft`, `warning-ink`
- danger badge uses `danger`, `danger-soft`, `danger-ink`
- info badge uses `info`, `info-soft`, `info-ink`

Dialog backdrop:

- use `--ak-color-backdrop`

### Incorrect usage examples

Do not:

- hardcode hex values inside components
- use `primary` for warning/danger semantics
- use border colors as text colors
- derive component styling from unrelated tokens
- invent one-off component colors inside `askr-ui`

---

## Semantic Meaning of Key Tokens

### Primary

The main brand/accent color used for primary actions, active highlights, selected emphasis, and interactive accenting.

### Soft

A low-emphasis tinted background, typically used for selected items, badges, soft alerts, and subtle emphasis.

### Ink

Readable foreground color intended to sit on a soft or tinted background.

### Surface

The default UI container surface.

### Surface Muted

A lower-emphasis surface used to distinguish nested or grouped regions.

### Surface Raised

A slightly elevated surface used for cards, dropdowns, or overlays that need more separation than default surface.

### Surface Overlay

The surface color for overlay UI such as popovers, menus, and dialog panels when composited over the app.

### Border Subtle / Border / Border Strong

- subtle: low-emphasis separators
- border: standard control and card border
- strong: emphasized dividers, active frames, or stronger chrome

### Text / Text Muted / Text Subtle / Text Inverse

- text: default readable foreground
- text-muted: secondary information
- text-subtle: tertiary or very quiet metadata
- text-inverse: text placed on strong/dark/accent backgrounds

### Hover / Active

Generic interaction overlays for neutral interactive surfaces.

### Selected

Selection state for tabs, nav items, rows, or toggles.

### Disabled

Disabled semantic ladder for background, surface, border, and text.

---

## Invariants

All official themes must satisfy these invariants:

1. `--ak-color-text` must be readable on `--ak-color-bg`
2. `--ak-color-text` must be readable on `--ak-color-surface`
3. `--ak-color-text-muted` must remain readable for secondary content
4. `--ak-color-text-inverse` must be readable on `--ak-color-primary`
5. `--ak-color-primary-ink` must be readable on `--ak-color-primary-soft`
6. each status `*-ink` must be readable on its corresponding `*-soft`
7. borders must remain visible against adjacent surfaces
8. focus ring must remain visible on both bg and surface contexts
9. disabled text must appear visually disabled without becoming unreadable
10. backdrop must provide sufficient separation for modal surfaces
11. hover and active states must remain perceptible but restrained
12. selected state must be visually distinct from hover state

---

## Recommended Defaults

These are recommended implementation defaults for component authors:

- default body text: `--ak-color-text`
- secondary text: `--ak-color-text-muted`
- tertiary text: `--ak-color-text-subtle`
- page background: `--ak-color-bg`
- panel/card background: `--ak-color-surface`
- subdued section background: `--ak-color-surface-muted`
- stronger card/popover background: `--ak-color-surface-raised`
- overlay panel background: `--ak-color-surface-overlay`
- standard border: `--ak-color-border`
- subtle divider: `--ak-color-border-subtle`
- strong emphasis border: `--ak-color-border-strong`

---

## Reference Theme Template

```css
/* __THEME_NAME__ theme */

:root {
  /* typography */
  --ak-font-family-body: system-ui, sans-serif;
  --ak-font-family-mono: ui-monospace, SFMono-Regular, Menlo, monospace;

  --ak-font-size-xs: 0.75rem;
  --ak-font-size-sm: 0.875rem;
  --ak-font-size-md: 1rem;
  --ak-font-size-lg: 1.125rem;
  --ak-font-size-xl: 1.25rem;
  --ak-font-size-2xl: 1.5rem;

  --ak-font-weight-regular: 400;
  --ak-font-weight-medium: 500;
  --ak-font-weight-semibold: 600;
  --ak-font-weight-bold: 700;

  --ak-line-height-tight: 1.2;
  --ak-line-height-normal: 1.5;
  --ak-line-height-relaxed: 1.7;

  /* spacing */
  --ak-space-xs: 0.25rem;
  --ak-space-sm: 0.5rem;
  --ak-space-md: 0.75rem;
  --ak-space-lg: 1rem;
  --ak-space-xl: 1.5rem;
  --ak-space-2xl: 2rem;
  --ak-space-3xl: 3rem;

  /* radius */
  --ak-radius-sm: 6px;
  --ak-radius-md: 10px;
  --ak-radius-lg: 14px;
  --ak-radius-xl: 22px;
  --ak-radius-round: 9999px;

  /* borders */
  --ak-border-width-sm: 1px;
  --ak-border-width-md: 2px;

  /* shadows */
  --ak-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
  --ak-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.1);
  --ak-shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.16);

  /* focus */
  --ak-focus-ring-width: 3px;
  --ak-focus-ring-offset: 2px;

  /* motion */
  --ak-duration-fast: 120ms;
  --ak-duration-normal: 180ms;
  --ak-duration-slow: 280ms;
  --ak-ease-standard: ease;

  /* icons */
  --ak-icon-size-sm: 1rem;
  --ak-icon-size-md: 1.25rem;
  --ak-icon-size-lg: 1.5rem;
  --ak-icon-size-xl: 1.75rem;
  --ak-icon-stroke-width-sm: 1.75;
  --ak-icon-stroke-width-md: 2;
  --ak-icon-stroke-width-lg: 2;
  --ak-icon-stroke-width-xl: 2.25;

  /* layout */
  --ak-breakpoint-sm: 40rem;
  --ak-breakpoint-md: 48rem;
  --ak-breakpoint-lg: 64rem;
  --ak-breakpoint-xl: 80rem;
  --ak-layout-navbar-height: 56px;
  --ak-layout-sidebar-width-sm: 14rem;
  --ak-layout-sidebar-width-md: 16rem;
  --ak-layout-sidebar-width-lg: 20rem;
  --ak-layout-sidebar-width-xl: 24rem;
  --ak-layout-sidebar-width: 16.25rem;
  --ak-layout-content-max-width: 75rem;

  /* stacking */
  --ak-z-dropdown: 1000;
  --ak-z-sticky: 1100;
  --ak-z-fixed: 1200;
  --ak-z-modal-backdrop: 1300;
  --ak-z-modal: 1400;
  --ak-z-popover: 1500;
  --ak-z-toast: 1550;
  --ak-z-tooltip: 1600;
}

:root,
[data-theme='light'] {
  --ak-color-primary: #79b53f;
  --ak-color-primary-hover: #5f9132;
  --ak-color-primary-active: #4f792b;
  --ak-color-primary-soft: #e5efd5;
  --ak-color-primary-ink: #29411a;

  --ak-color-text: #2f2b2a;
  --ak-color-text-muted: #716660;
  --ak-color-text-subtle: #8b8178;
  --ak-color-text-inverse: #fffdfa;

  --ak-color-bg: #f5f1ea;
  --ak-color-surface: #fffdfa;
  --ak-color-surface-muted: #ece5da;
  --ak-color-surface-raised: #ffffff;
  --ak-color-surface-overlay: rgba(255, 253, 250, 0.92);

  --ak-color-border-subtle: #ddd4c7;
  --ak-color-border: #cbbfb0;
  --ak-color-border-strong: #a99987;

  --ak-color-success: #3b8f57;
  --ak-color-success-soft: rgba(59, 143, 87, 0.16);
  --ak-color-success-ink: #163b22;
  --ak-color-warning: #b7791f;
  --ak-color-warning-soft: rgba(183, 121, 31, 0.16);
  --ak-color-warning-ink: #4c320c;
  --ak-color-danger: #b45a5a;
  --ak-color-danger-soft: rgba(180, 90, 90, 0.18);
  --ak-color-danger-ink: #4a1f1f;
  --ak-color-info: #3a78b8;
  --ak-color-info-soft: rgba(58, 120, 184, 0.16);
  --ak-color-info-ink: #18324d;

  --ak-color-link: var(--ak-color-primary);
  --ak-color-link-hover: var(--ak-color-primary-hover);
  --ak-color-focus-ring: rgba(121, 181, 63, 0.28);
  --ak-color-disabled-bg: #e7dfd3;
  --ak-color-disabled-surface: #f1ebe3;
  --ak-color-disabled-border: #d7ccbe;
  --ak-color-disabled-text: #9c9187;
  --ak-color-selected: #e5efd5;
  --ak-color-selected-border: #b8d38f;
  --ak-color-hover: rgba(47, 43, 42, 0.04);
  --ak-color-active: rgba(47, 43, 42, 0.08);
  --ak-color-backdrop: rgba(25, 20, 18, 0.45);

  color-scheme: light;
}

[data-theme='dark'] {
  --ak-color-primary: #9bd45f;
  --ak-color-primary-hover: #7eb448;
  --ak-color-primary-active: #6a983d;
  --ak-color-primary-soft: rgba(155, 212, 95, 0.18);
  --ak-color-primary-ink: #d9efbf;

  --ak-color-text: #e8e1d8;
  --ak-color-text-muted: #b8aea2;
  --ak-color-text-subtle: #94897d;
  --ak-color-text-inverse: #1f2225;

  --ak-color-bg: #1f2225;
  --ak-color-surface: #2a2e31;
  --ak-color-surface-muted: #34393d;
  --ak-color-surface-raised: #3a4044;
  --ak-color-surface-overlay: rgba(42, 46, 49, 0.92);

  --ak-color-border-subtle: #49443d;
  --ak-color-border: #565048;
  --ak-color-border-strong: #746b61;

  --ak-color-success: #6fca88;
  --ak-color-success-soft: rgba(111, 202, 136, 0.18);
  --ak-color-success-ink: #d6f3de;
  --ak-color-warning: #e0ad52;
  --ak-color-warning-soft: rgba(224, 173, 82, 0.18);
  --ak-color-warning-ink: #fff0cf;
  --ak-color-danger: #df8d8d;
  --ak-color-danger-soft: rgba(223, 141, 141, 0.18);
  --ak-color-danger-ink: #ffe2e2;
  --ak-color-info: #7eb2eb;
  --ak-color-info-soft: rgba(126, 178, 235, 0.18);
  --ak-color-info-ink: #e2f0ff;

  --ak-color-link: var(--ak-color-primary);
  --ak-color-link-hover: var(--ak-color-primary-hover);
  --ak-color-focus-ring: rgba(155, 212, 95, 0.3);
  --ak-color-disabled-bg: #303438;
  --ak-color-disabled-surface: #2b2f33;
  --ak-color-disabled-border: #444a4f;
  --ak-color-disabled-text: #7f776e;
  --ak-color-selected: rgba(155, 212, 95, 0.18);
  --ak-color-selected-border: #7eb448;
  --ak-color-hover: rgba(232, 225, 216, 0.05);
  --ak-color-active: rgba(232, 225, 216, 0.1);
  --ak-color-backdrop: rgba(0, 0, 0, 0.55);

  color-scheme: dark;
}
```

## Component Variants

Components support variant styling through `data-variant` and `data-size` attributes.

### Button Variants

```html
<button data-slot="button" data-variant="primary">Primary</button>
<button data-slot="button" data-variant="secondary">Secondary</button>
<button data-slot="button" data-variant="outline">Outline</button>
<button data-slot="button" data-variant="ghost">Ghost</button>
<button data-slot="button" data-variant="destructive">Destructive</button>
<button data-slot="button" data-variant="link">Link</button>
```

### Button Sizes

```html
<button data-slot="button" data-size="sm">Small</button>
<button data-slot="button">Default (md)</button>
<button data-slot="button" data-size="lg">Large</button>
<button data-slot="button" data-size="icon">Icon</button>
```

### Badge Variants

```html
<span data-slot="badge">Default</span>
<span data-slot="badge" data-variant="secondary">Secondary</span>
<span data-slot="badge" data-variant="outline">Outline</span>
<span data-slot="badge" data-variant="success">Success</span>
<span data-slot="badge" data-variant="warning">Warning</span>
<span data-slot="badge" data-variant="danger">Danger</span>
<span data-slot="badge" data-variant="info">Info</span>
```

### Toast Variants

```html
<div data-slot="toast" data-variant="success">Success toast</div>
<div data-slot="toast" data-variant="warning">Warning toast</div>
<div data-slot="toast" data-variant="danger">Danger toast</div>
<div data-slot="toast" data-variant="info">Info toast</div>
```

### Customizing Variants

Override variant styles using the same selector pattern:

```css
[data-slot='button'][data-variant='primary'] {
  background: linear-gradient(
    135deg,
    var(--ak-color-primary),
    var(--ak-color-primary-hover)
  );
}
```

---

## Animations

Overlay components include enter/exit animations using `@keyframes` and motion tokens:

- **Dialog**: fade-in overlay + scale-in content
- **Popover/Dropdown/Select**: slide-up with fade
- **Tooltip**: subtle slide-up
- **Toast**: slide-in from right

All animations use `--ak-duration-fast` and `--ak-duration-normal` tokens. To customize:

```css
:root {
  --ak-duration-fast: 80ms; /* snappier */
  --ak-duration-normal: 150ms;
}
```

Exit animations are triggered via `[data-state='closed']` selectors.

---

## Accessibility

### Reduced Motion

All themes respect `prefers-reduced-motion`. When enabled, all duration tokens are set to `0s`:

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --ak-duration-fast: 0s;
    --ak-duration-normal: 0s;
    --ak-duration-slow: 0s;
  }
}
```

### Automatic Dark Mode

When no `data-theme` attribute is set, themes auto-detect OS preference:

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    /* dark color tokens applied automatically */
  }
}
```

Explicit `data-theme="light"` or `data-theme="dark"` always takes precedence.

### WCAG Contrast

All official themes are tested for WCAG AA compliance:

- Text on backgrounds: 4.5:1 minimum
- UI components and large text: 3:1 minimum
- Status ink on soft backgrounds: 3:1 minimum
- Inverse text on primary: 4.5:1 minimum

The automated test suite (`tests/contrast.test.ts`) validates these pairs across all themes in both light and dark modes.

---

## Theme Personalities

Each official theme has a distinct visual personality beyond color:

| Theme              | Radius       | Shadows        | Feel              |
| ------------------ | ------------ | -------------- | ----------------- |
| Default (green)    | 6/10/14/22px | Neutral        | Natural, balanced |
| Tuxedo (blue-gray) | 4/8/12/20px  | Cool blue-gray | Sharp, corporate  |
| Calico (brown)     | 8/12/16/24px | Warm brown     | Soft, organic     |
| Ginger (orange)    | 8/12/16/24px | Warm orange    | Bold, energetic   |

---

## Implementation Note

The v1.0 contract above is the official semantic surface. Official theme component CSS now consumes the semantic token names directly. Shipped themes still publish temporary compatibility aliases such as `--ak-color-fg`, `--ak-color-muted`, and `--ak-font-family` for downstream compatibility, but those aliases are not part of the required contract and should not be used for new work.
