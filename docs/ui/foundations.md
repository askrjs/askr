# UI: Foundations

Foundations are low-level behavior primitives that define the only correct way to implement
a given interaction policy. `askr-ui` components are built on foundations.

## Principle

**Foundations define the ONLY way to implement behavior. Components compose foundations —
they do not re-implement them.**

This ensures accessibility and interaction contracts are consistent across every component
that handles the same type of interaction.

## How foundations relate to components

```
User code
    ↑ composes
askr-ui components   (Button, Dialog, Select, ...)
    ↑ built on
foundations          (applyInteractionPolicy, focusScope, ...)
    ↑ from
@askrjs/askr/foundations
```

Your application code should compose `askr-ui` components. You only need to use foundations
directly when building a new primitive that `askr-ui` does not provide.

## See also

- [askr-ui overview](./askr-ui.md)
- [Components](./components.md)
- [Internals: foundations pit of success](../internals/foundations-pit-of-success.md)
- [API: foundations subpath](../reference/api.md)
