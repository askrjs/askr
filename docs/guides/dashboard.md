# Dashboard Guide

Patterns for building dashboard layouts with Askr.

> This guide is a work in progress.

## What this covers

- App shell layout (sidebar + header)
- Stat cards
- Data tables in a dashboard context
- Navigation between dashboard sections

## Recommended structure

```
src/layouts/
  app-layout.tsx      — sidebar + sticky header + main content

src/components/
  stat-card.tsx
  app-sidebar.tsx
  app-header.tsx

src/routes/
  dashboard.tsx
```

## See also

- [Guide: layouts](./layouts.md)
- [Core: routing](../core/routing.md)
- [CLI: startkit template](https://github.com/askrjs/askr-cli/tree/main/docs/create.md)
