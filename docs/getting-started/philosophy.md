# Philosophy

The principles behind Askr's design decisions.

## Convention over configuration

Askr prefers strong defaults to reduce decision fatigue.

Project structure is standardized. Route definitions follow one model. Code generation
produces consistent output. When there is a recommended way to do something, Askr
chooses it rather than leaving it open.

This means less time spent on tooling decisions and more time spent building the application.

## Composition over sprawling prop APIs

Components are composed from behavior primitives rather than configured through large prop
surfaces.

A button with an icon is not `<Button icon="save" iconPosition="left">`. It is:

```tsx
<Button>
  <Save size={14} aria-hidden="true" /> Save changes
</Button>
```

This keeps component APIs narrow and lets behavior scale through composition.

## Headless first

UI behavior is separated from styling.

`askr-ui` provides interaction behavior and accessibility patterns. `askr-themes` provides
visual defaults. Your application CSS provides final overrides. These layers are independent —
you can use `askr-ui` without `askr-themes`, or bring your own design system entirely.

Headless-first means the behavior contract does not change when you change the visual design.

## AI-friendly structure

Predictable structure improves reliability of AI-assisted development.

When route files, component files, and feature folders follow a consistent pattern, AI tools
can reason about the codebase more accurately. The same convention that helps a new developer
orient quickly also helps a language model generate correct code on the first try.

Askr is designed with this property intentionally. One model, one structure, one set of
conventions — everywhere.

## Batteries included

Common application needs should work without reaching for external libraries.

The platform covers the typical frontend application surface:

- State management
- Routing (SPA, SSR, SSG)
- Async data and cancellation
- Headless UI primitives
- Theming
- Project scaffolding

You should be able to build a production-quality Askr application without assembling
your own toolkit.
