# Guarantees Index

This index maps framework guarantees to implementation and tests.

## Runtime guarantees

- Deterministic event ordering
- Atomic render/commit behavior
- Hook order/state index enforcement
- Cleanup and cancellation correctness

## Reading order

1. [Determinism](../concepts/determinism.md)
2. [Runtime Enforcement](../concepts/runtime-enforcement.md)
3. [Testing Guide](../contributing/testing.md)
4. [Test Suite README](../../tests/README.md)

## Notes

Tests are the executable source of truth for guarantee validation.
