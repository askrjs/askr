# Copilot Instructions — askr-ui

These instructions guide Copilot (and contributors using Copilot) on how to author **components**, **tests**, and **benches** for askr-ui so they meet our "world-class" quality bar before being exported from the package.

Guiding principles

- Components are tiny, un-opinionated, and "headless" (no styles) by default. They must be behaviour-first and composable.
- Accessibility is not optional. Every interactive component must include automated accessibility checks (axe) and thoughtful keyboard/focus behavior.
- Types are part of the public API. Components must provide strong TypeScript typings (polymorphic where appropriate) and `tsd` tests to lock behavior.
- Tests are canonical documentation. Each component has a single test file that covers behavioural invariants, accessibility, and edge cases.
- Performance matters. Add benches for hot paths and use bench snapshots or thresholds to catch regressions.
- No component should be exported from `src/index.ts` until it fully satisfies the guardrails below.

Creation checklist (must be satisfied before exporting or merging)

1. Component implementation
   - Headless: contains no styling or CSS concerns.
   - Supports `asChild` pattern via `Slot` for prop / ref merging when appropriate.
   - For interactive components:
     - Keyboard activation & focus rules implemented (Enter/Space where relevant).
     - `disabled` semantics behave correctly for native elements and `asChild` usage (aria-disabled, event suppression, tabIndex management).
     - `ref` forwarding supported for both function and object refs.
     - Avoid forwarding element-specific attributes to incompatible element types (e.g., do not forward `type` onto anchors).
   - Small utilities (like `Slot`) should prefer setting DOM properties over attributes when appropriate.

2. Types & type tests
   - Provide polymorphic typings where the element type matters (e.g., `Button` should have overloads for native button vs `asChild`).
   - Add `tsd` tests that assert correct return element types, errors for invalid prop combos, and prohibit invalid props.

3. Tests
   - Single test file per component: `tests/components/<component>.test.tsx`.
   - Naming: all test cases must follow the phrasing: `should <x> given <y> when <z>`.
   - Coverage: include tests for render, prop forwarding, interactions (mouse/keyboard), disabled semantics, ref forwarding, and edge cases.
   - Accessibility: include an axe check `it('should have no automated axe violations given ...')` in the same test file. Print failures as test errors (not console logs).
   - Avoid `console.*` in tests; prefer throwing errors or using expect assertions to surface failures.

4. Benches
   - Add benches for hot paths: creation, prop merging, activation dispatch, or other critical loops.
   - Place benches under `benches/<area>/<component>.bench.ts`.
   - Run benches locally and capture representative baselines; consider adding thresholds or snapshot tooling to monitor regressions.

5. Lint, format & CI checks
   - Tests and source must pass ESLint (no console), TypeScript build, and `tsd` tests.
   - Add a test that fails on axe violations with a readable error message.
   - Bench CI jobs are optional and can be nightly; do not block PRs by default with benches.

6. Docs & examples
   - Add a short usage example in `RULES.md` or a dedicated `docs/components/<component>.md` showing `asChild`, `disabled`, and `ref` usage.

7. Export policy
   - Only after completing the checklist and receiving a passing test suite (unit + type + accessibility) may a component be added to `src/index.ts` and `exports`.
   - For multi-step features, add a clear `TODO: export when ready` comment in `src/index.ts` — do not export half-baked components.

How Copilot should generate code

- Follow the patterns already in repository: `Slot` usage, minimal JSX runtime, and runtime type permissiveness where necessary.
- Prefer clear, testable, and minimal logic over cleverness.
- Use explicit checks and guardrails for accessibility (aria, role, tabIndex) and disabled semantics.
- Add tests and benches alongside the component; do not leave tests for later.

Templates (high level)

- Component file: `src/components/<name>/<name>.tsx` with a small prop interface, exported `function <Name>(props)` and JSDoc describing behavior.
- Test file: `tests/components/<name>.test.tsx` containing the behavioural and axe tests.
- Bench file (if relevant): `benches/components/<name>.bench.ts`.
- Type tests: `tests/types/<name>.test-d.ts` or top-level `tests/types` file validating polymorphic behavior via `tsd`.

Examples

- Button: must implement keyboard activation on non-button children (Enter/Space), disabled semantics, ref forwarding, and `tsd` tests to ensure `Button()` returns `HTMLButtonElement` by default and returns the child element type when `asChild` is used.

Maintenance notes

- If tests are flaky on jsdom (focus, keyboard), append elements to `document.body` in the test before using `.focus()` or dispatching events.
- For accessibility rules that axe can't check in jsdom (e.g., contrast), add a note to add Playwright-based axe checks to CI later.

If anything is ambiguous, prefer conservative behavior (more accessible, stricter typings) and add a short note in the PR explaining the design choices.

---

These instructions are authoritative for Copilot-generated component work and should be updated only when the team agrees on a new standard.
