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

`debounceEvent` and `throttleEvent` use the same edge rules as `debounce` and
`throttle`: with both edges enabled, a single event runs the handler once, and
the trailing call only runs when another event arrived after the leading call.
`debounceEvent().flush()` runs only a pending trailing call. When created
during a component render, these wrappers are cancelled when the component
unmounts.

`scheduleTimeout`, `scheduleIdle`, and `scheduleRetry` throw when called during
render. Call them from a mounted component's `task()`, `watch()` callback, or
event handler: the pending work is then cancelled automatically when that
component unmounts. Only the synchronous part of the task or callback is
tracked, so work scheduled after an `await`, or outside any component, must be
cancelled manually with the returned `cancel`.

```tsx
function Toast() {
  task(() => {
    scheduleTimeout(3000, dismiss); // cancelled if Toast unmounts first
  });
  return <button onClick={() => scheduleTimeout(500, flash)}>Flash</button>;
}
```

## Related

- [API Overview](api.md)
