# Testing Guide

Askr tests validate framework guarantees and developer ergonomics.

## What to read first

- [Test Suite README](../../tests/README.md)
- [Guarantees Index](../reference/spec-guarantees.md)

## Running tests

```bash
npm test
```

## Scope guidance

- Add tests for behavior guarantees, not implementation details.
- Prefer deterministic assertions over timing-based checks.
- Keep test names explicit about the guarantee being proven.

## Related

- [Runtime Enforcement](../concepts/runtime-enforcement.md)
- [Determinism](../concepts/determinism.md)
