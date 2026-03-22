# CLI: add

Generate feature code into an existing Askr project.

> **Status:** `add` generators are planned. This page tracks the intended API.

## Philosophy

Generators scaffold the right files in the right places according to Askr conventions.
Generated code is normal Askr code — no runtime magic, no generator dependency.

## Planned commands

```bash
askr add page <name>
askr add route <path>
askr add crud <model>
askr add table <name>
askr add form <name>
```

## `add page`

Scaffold a new page component and register the route.

Generates:

- `src/routes/<name>.tsx`
- Route entry in `src/router.tsx`

## `add crud`

Scaffold a full CRUD UI for a model: list view, detail view, create form, edit form.

Generates:

- `src/routes/<model>.tsx`
- `src/routes/<model>.detail.tsx`
- `src/features/<model>/<model>-table.tsx`
- `src/features/<model>/<model>-form.tsx`

## See also

- [CLI overview](./overview.md)
- [Conventions](../reference/conventions.md)
