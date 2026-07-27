# Component Generation Spec

Use this guide when creating components manually or with AI assistance.

## Purpose

Generate components that are:

- idiomatic for Askr
- deterministic
- easy to compose
- stable under lint/type checks

## Canonical Component Shape

```tsx
import { type JSXElement } from '@askrjs/askr/foundations';

export type ExampleCardProps = {
  title: string;
  subtitle?: string;
  actions?: JSXElement;
};

export function ExampleCard({
  title,
  subtitle,
  actions,
}: ExampleCardProps): JSXElement {
  return (
    <section data-slot="example-card">
      <header data-slot="example-card-header">
        <h2 data-slot="example-card-title">{title}</h2>
        {subtitle ? <p data-slot="example-card-subtitle">{subtitle}</p> : null}
      </header>
      {actions ? <div data-slot="example-card-actions">{actions}</div> : null}
    </section>
  );
}
```

## Required Rules

1. File naming: kebab-case file names.
2. Symbol naming: PascalCase component names and `*Props` types.
3. Export style: named exports only.
4. Slots: every rendered structural node should use `data-slot`.
5. API shape: prefer narrow props and composition (`actions?: JSXElement`) over prop bloat.
6. Async: do not fetch directly in display components; use `resource()` in route/container level.
7. State: keep local UI state in `state()`, cross-cutting state via context.

## Do / Do Not

Do:

- compose `askr-ui` primitives when behavior is non-trivial
- model variants with semantic props (`tone`, `size`, `intent`) and CSS selectors
- keep rendering deterministic and side-effect free
- return a Fragment when a component must contribute multiple direct siblings
  without changing the parent element's child topology

Do not:

- hardcode `--ak-*` token strings in runtime TS/JS
- call APIs directly in leaf UI components
- add component-specific business rules in generic primitives
- add a wrapper element solely to satisfy a component return shape

## Checklist for AI-generated Components

1. Props are minimal and typed.
2. Component has stable `data-slot` hooks.
3. No direct token literals (`--ak-*`) in TS/JS.
4. No ad-hoc cancellation APIs; use `resource()` boundaries.
5. Behavior and accessibility are covered by tests when interactive.

## Related

- [Conventions](../reference/conventions.md)
- [UI composition](https://github.com/askrjs/askr-ui/tree/main/docs/composition.md)
- [Data primitives](../core/data.md)
