# Documentation Migration Reference

This document maps old documentation paths to their new locations in the reorganized Askr docs.

## Migration Map (Old → New)

| Old Path                             | New Path                                       | Status             |
| ------------------------------------ | ---------------------------------------------- | ------------------ |
| `docs/quick-start.md`                | `docs/getting-started/quick-start.md`          | ✅ Moved & cleaned |
| `docs/state.md`                      | `docs/guides/state.md`                         | ✅ Moved           |
| `docs/enforcement.md`                | `docs/concepts/runtime-enforcement.md`         | ✅ Moved & renamed |
| `docs/determinism.md`                | `docs/concepts/determinism.md`                 | ✅ Moved           |
| `docs/event-delegation.md`           | `docs/advanced/event-delegation.md`            | ✅ Moved           |
| `docs/selective-hydration.md`        | `docs/advanced/selective-hydration.md`         | ✅ Moved           |
| `docs/ssr-events.md`                 | `docs/guides/ssr-events.md`                    | ✅ Moved           |
| `docs/for-primitive-design.md`       | `docs/internals/for-primitive-design.md`       | ✅ Moved           |
| `docs/foundations-pit-of-success.md` | `docs/internals/foundations-pit-of-success.md` | ✅ Moved           |
| `docs/foundations-audit-report.md`   | `docs/internals/foundations-audit-report.md`   | ✅ Moved           |

## New Files Added

| Path                                    | Purpose                              |
| --------------------------------------- | ------------------------------------ |
| `docs/index.md`                         | Documentation hub and navigation     |
| `docs/getting-started/installation.md`  | Package installation and setup guide |
| `docs/guides/router.md`                 | Router usage guide                   |
| `docs/guides/resources.md`              | Resources (async data) usage guide   |
| `docs/guides/ssr.md`                    | SSR high-level guide                 |
| `docs/reference/api.md`                 | API overview and import styles       |
| `docs/reference/router.md`              | Router API reference                 |
| `docs/reference/resources.md`           | Resources API reference              |
| `docs/reference/fx.md`                  | FX utilities API reference           |
| `docs/reference/spec-guarantees.md`     | Framework guarantees index           |
| `docs/troubleshooting/common-issues.md` | Troubleshooting index                |
| `docs/contributing/docs-style-guide.md` | Documentation standards              |
| `docs/contributing/testing.md`          | Testing guide                        |
| `docs/migration/from-react.md`          | React → Askr migration guide         |

## Information Architecture

```
docs/
├── index.md (navigation hub)
├── getting-started/
│   ├── installation.md (setup)
│   └── quick-start.md (minimal app)
├── guides/
│   ├── state.md (user guide)
│   ├── router.md (user guide)
│   ├── resources.md (user guide)
│   ├── ssr.md (overview)
│   └── ssr-events.md (advanced guide)
├── concepts/
│   ├── determinism.md
│   └── runtime-enforcement.md
├── reference/
│   ├── api.md (API overview)
│   ├── router.md (API reference)
│   ├── resources.md (API reference)
│   ├── fx.md (API reference)
│   └── spec-guarantees.md (guarantees index)
├── advanced/
│   ├── event-delegation.md
│   └── selective-hydration.md
├── internals/
│   ├── for-primitive-design.md
│   ├── foundations-pit-of-success.md
│   └── foundations-audit-report.md
├── troubleshooting/
│   └── common-issues.md
├── contributing/
│   ├── docs-style-guide.md
│   └── testing.md
├── migration/
│   └── from-react.md
```

## Audience Pathways

### 👶 **New User (First-time discoverer)**

1. [Install](getting-started/installation.md)
2. [Quick Start](getting-started/quick-start.md)
3. [State Guide](guides/state.md)
4. [Router Guide](guides/router.md) (if routed)
5. [API Overview](reference/api.md)

### 👨‍💻 **Developer (Building an app)**

1. [Quick Start](getting-started/quick-start.md)
2. [State Guide](guides/state.md)
3. [Router Guide](guides/router.md)
4. [Resources Guide](guides/resources.md)
5. [Troubleshooting](troubleshooting/common-issues.md)

### 🚀 **Advanced (Scaling, optimizing, SSR)**

1. [SSR Guide](guides/ssr.md)
2. [Selective Hydration](advanced/selective-hydration.md)
3. [Event Delegation](advanced/event-delegation.md)

### 🔬 **Internal/Maintainer (Framework design)**

1. [Guarantees Index](reference/spec-guarantees.md)
2. [Runtime Enforcement](concepts/runtime-enforcement.md)
3. [Determinism](concepts/determinism.md)
4. [For Primitive Design](internals/for-primitive-design.md)
5. [Foundations: Pit of Success](internals/foundations-pit-of-success.md)
6. [Foundations: Audit Report](internals/foundations-audit-report.md)
7. [Testing Guide](contributing/testing.md)
8. [Docs Style Guide](contributing/docs-style-guide.md)

## Link Updates in Root Docs

| File                                        | Change                                                         |
| ------------------------------------------- | -------------------------------------------------------------- |
| [README.md](../README.md#L150-L158)         | Updated 9 doc links to new structure                           |
| [tests/README.md](../../tests/README.md#L5) | Fixed SPEC.md reference to `docs/reference/spec-guarantees.md` |

## Quality Validation

- ✅ All markdown links resolve (cross-checked against filesystem)
- ✅ All 334 tests pass
- ✅ No linting errors
- ✅ No broken intra-doc references
- ✅ All new pages have audience, purpose, and next-links

## Review Checklist

Before finalizing, verify:

- [ ] All links in [docs/index.md](index.md) resolve correctly
- [ ] All "Next" links at page footers are current
- [ ] Terminology is consistent across all pages
- [ ] Section headings and audience guidance are clear
- [ ] Code examples are conceptually valid (not tested for execution)
