# CRUD Guide

Patterns for building Create, Read, Update, Delete interfaces in Askr.

> This guide is a work in progress.

## What this covers

- List view with a data table
- Detail view
- Create form
- Edit form
- Delete confirmation

## Recommended structure

```
src/routes/
  users.tsx           — list route
  users.detail.tsx    — detail route

src/features/users/
  user-table.tsx
  user-form.tsx
  user-filters.tsx

src/lib/
  users.ts            — API calls
```

## See also

- [Core: data](../core/data.md)
- [Guide: forms](./forms.md)
- [Guide: tables](./tables.md)
- [Conventions](../reference/conventions.md)
