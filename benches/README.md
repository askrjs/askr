# Benchmarking Guide

This repository uses a strict, two-tier benchmark taxonomy and a precise naming convention to avoid misinterpretation and to make results comparable over time.

## Two Tier Taxonomy

Tier A — DOM / Reconcile-only (prefix: `dom`)

- Measures only DOM-level operations (no framework involvement).
- Allowed operations:
  - `DocumentFragment` creation
  - `appendChild` on detached fragments
  - a single `replaceChildren` to apply the fragment
- Purpose: prove algorithmic and DOM efficiency. Results are "pure DOM" and must not be compared directly with Tier B.

Tier B — Framework / Transactional (prefix: `framework`)

- Measures full-system cost: state mutation, scheduler enqueue + flush, component execution, reconciliation, commit.
- Purpose: measure real user-visible cost of a pattern (e.g. batched state mutations).

> Important: Tier A and Tier B measure different layers and **must not be compared directly**.

## Naming convention

All benches must follow this title format (bench name string):

```
<tier>::<scenario>::<size>::<pattern>
```

- `<tier>` = `dom` | `framework`
- `<scenario>`: e.g. `keyed-reorder`, `positional-reorder`, `mount-churn`, `attribute-updates`, `text-node-updates`, `replacefragment`
- `<size>`: `small` | `medium` | `large` or explicit counts like `5`, `100`, `1k`, `5k`, `10k`
- `<pattern>`: concise description of batching semantics, e.g. `pure-reconcile`, `batched-state-mutations`, `single-commit`, `toggle`, `behavioral`

Examples:

- `dom::replacefragment::10k::pure-reconcile`
- `framework::keyed-reorder::5k::batched-state-mutations`
- `framework::mount-churn::100::toggle`

## Semantics and expectations

- If a bench performs N state writes and a single flush/commit, it must use `batched-state-mutations` in the pattern. Do not label such a bench as "N reorders" — that is ambiguous.
- For large-case benches, setup (DOM creation / app creation / initial mount) must be performed in `beforeAll` / once-only code so the measured closure/body contains only the hot path.
- Reconcile-only microbenchmarks should return a closure when possible (setup once; measured operation returned) to separate setup from measurement.

## Interpretation

- Tier A numbers reflect DOM algorithm performance (e.g., cost to reorder via fragment + replaceChildren).
- Tier B numbers reflect full system end-to-end cost (including scheduler, reconciliation, event wiring, etc.).
- Use the naming convention to filter and compare like-with-like across commits.

## Running benches

- Run all benches: `npm run bench`
- Run a single bench file: `npm run bench -- benches/ssr/ssr-render.large.bench.tsx`
- Filter by bench name (Vitest `-t`): use `npx` to avoid npm argument parsing quirks:
  - Example: `npx vitest bench --run --config vitest.bench.config.ts benches/ssr/ssr-render.isolated.attrs-escape.bench.tsx -t "escape-heavy"`

## SSR isolation benches

To reduce GC variance while optimizing SSR, prefer the isolated SSR benches:

- `benches/ssr/ssr-render.isolated.large.bench.tsx` (separates tree construction from render-only)
- `benches/ssr/ssr-render.isolated.attrs-escape.bench.tsx` (separate attrs-heavy vs escape-heavy workloads)

## Maintenance notes

- Do not change framework behavior in order to improve bench numbers. The goal is clarity and correctness.
- Add inline comments in any new bench file that explain tier membership and what is included/excluded.

---

This file should guide contributors and CI owners when adding or interpreting benchmarks.
