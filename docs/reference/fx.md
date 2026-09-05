# FX API Reference

Import from `@askrjs/askr/fx`.

Timing and utility helpers are framework-independent.

`debounce`, `throttle`, and `raf` return wrappers whose calls return `void`.
Arguments and receiver types are preserved; scheduled callback results are
discarded, including leading execution. Move result handling into the callback
instead of assigning or awaiting the wrapper result. Scheduling, coalescing,
and the existing debounce/throttle `cancel()` methods are unchanged.

## Core timing utilities

- `debounce`
- `throttle`
- `once`
- `defer`
- `raf`
- `idle`
- `timeout`
- `retry`

## Event-oriented helpers

- `debounceEvent`
- `throttleEvent`
- `rafEvent`
- `scheduleTimeout`
- `scheduleIdle`
- `scheduleRetry`
- `scheduleEventHandler`

## Related

- [API Overview](api.md)
