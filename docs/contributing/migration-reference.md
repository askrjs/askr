# Documentation Migration Reference

This page records the historical docs reorganization inside the `askr`
repository. It is maintained for contributors who need to understand old links
or review older commits.

## Path Map

| Previous Path                       | Current Path                                    | Notes                  |
| ----------------------------------- | ----------------------------------------------- | ---------------------- |
| `docs/quick-start.md`               | `docs/getting-started/quick-start.md`           | Renamed and expanded   |
| `docs/state.md`                     | `docs/guides/state.md`                          | Guide location         |
| `docs/enforcement.md`               | `docs/concepts/runtime-enforcement.md`          | Renamed for clarity    |
| `docs/determinism.md`               | `docs/concepts/determinism.md`                  | Concept location       |
| `docs/event-delegation.md`          | `docs/advanced/event-delegation.md`             | Advanced topic         |
| `docs/selective-hydration.md`       | `docs/advanced/selective-hydration.md`          | Advanced topic         |
| `docs/ssr-events.md`                | `docs/guides/ssr-events.md`                     | Guide location         |
| `docs/for-primitive-design.md`      | `docs/internals/for-primitive-design.md`        | Internal design note   |
| `docs/foundations-pit-of-success.md` | `docs/internals/foundations-pit-of-success.md` | Internal design note   |
| `docs/foundations-audit-report.md`  | `docs/internals/foundations-audit-report.md`    | Internal audit note    |

## Current Information Architecture

```text
docs/
  index.md
  README.md
  getting-started/
  guides/
  concepts/
  reference/
  advanced/
  internals/
  troubleshooting/
  contributing/
  migration/
  development/
  benchmarks/
  roadmap/
```

Package-owned docs for `askr-ui`, `askr-themes`, `askr-cli`, `askr-vite`,
`askr-lucide`, and `askr-charts` live in those package repositories. The
`askr` docs should link to package docs instead of duplicating their reference
content.

## Contributor Checklist

- Keep [docs/index.md](../index.md) and [docs/README.md](../README.md) current
  when adding or removing pages.
- Prefer relative links inside this repository.
- Use GitHub links for package-owned docs in sibling repositories.
- Verify examples against the owning package exports before publishing.
