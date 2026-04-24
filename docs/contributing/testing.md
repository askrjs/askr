# Testing Guide

Askr tests validate framework guarantees and developer ergonomics.

## What to read first

- [Test Suite README](../../tests/README.md)
- [Guarantees Index](../reference/spec-guarantees.md)

## Running tests

```bash
npm test
npm run test:jsdom
npm run test:browser
```

`npm test` runs both the jsdom/node-oriented suite and the Playwright-backed browser suite.

`npm run test:jsdom` runs just the jsdom and node-oriented suite.

`npm run test:browser` runs Vite Plus browser tests with the Playwright provider against Chromium. Install the browser binary once per machine with:

```bash
npm run test:browser:install
```

The browser suite is intended to complement jsdom coverage for real-browser event, DOM, and rendering behavior. Add new browser tests under `tests/playwright/**/*.browser.{ts,tsx}`.

## Scope guidance

- Add tests for behavior guarantees, not implementation details.
- Prefer deterministic assertions over timing-based checks.
- Keep test names explicit about the guarantee being proven.

## Related

- [Runtime Enforcement](../concepts/runtime-enforcement.md)
- [Determinism](../concepts/determinism.md)
