# FX API Reference

Import from `@askrjs/askr/fx`.

Timing and utility helpers are framework-independent.

`debounce`, `throttle`, and `raf` return wrappers whose calls return `void`.
Arguments and receiver types are preserved; scheduled callback results are
discarded, including leading execution. Move result handling into the callback
instead of assigning or awaiting the wrapper result. Scheduling, coalescing,
and the existing debounce/throttle `cancel()` methods are unchanged. `raf()`
also exposes `cancel()` to drop its pending frame; a later call can schedule
another frame.

## Core timing utilities

- `debounce`
- `throttle`
- `once`
- `raf`
- `idle`
- `timeout`
- `retry`

For one microtask, use the platform's `queueMicrotask(fn)`. The Askr
`defer(promise)` helper belongs to `@askrjs/askr/router` and marks deferred
route data.

## Event-oriented helpers

- `debounceEvent`
- `throttleEvent`
- `rafEvent`
- `scheduleTimeout`
- `scheduleIdle`
- `scheduleRetry`
- `scheduleEventHandler` (errors thrown by the wrapped handler are reported
  with `reportError()`)

`debounceEvent` and `throttleEvent` use the same edge rules as `debounce` and
`throttle`: with both edges enabled, a single event runs the handler once, and
the trailing call only runs when another event arrived after the leading call.
`debounceEvent().flush()` runs only a pending trailing call. When created
during a component render, or from a mounted component's `task()`, `watch()`
callback, or event handler, these wrappers are cancelled when that component
unmounts.

`scheduleTimeout`, `scheduleIdle`, and `scheduleRetry` throw when called during
render. Call them from a mounted component's `task()`, `watch()` callback, or
event handler: the pending work is then cancelled automatically when that
component unmounts. Handlers inside a portal belong to the component that
wrote the portal content. Handlers wrapped by `debounceEvent`, `throttleEvent`,
`rafEvent`, or `scheduleEventHandler` keep the owner of the event (or of the
component that created the wrapper) when they run later. Only the synchronous
part of the task or callback is tracked, so work scheduled after an `await`, or
outside any component, must be cancelled manually with the returned `cancel`.
Callbacks run by `scheduleTimeout` and `scheduleIdle`, and each `scheduleRetry`
attempt, run as the component that scheduled them, so work they schedule in
turn (such as a polling loop that reschedules itself) is also cancelled on
unmount. A callback whose component unmounted before it ran is skipped.
`scheduleRetry` stops without retrying when `fn` throws synchronously or does
not return a promise.
`retry()` and `scheduleRetry()` accept the same `RetryOptions` shape.
The returned handle has `cancel()` and a `result` promise. `result` resolves
to `{ status: 'success', value }`, `{ status: 'error', error }`, or
`{ status: 'cancelled' }`, so callers can inspect the terminal outcome without
an unhandled rejection. Terminal errors still reach the host error reporter.

Errors thrown by `scheduleTimeout` and `scheduleIdle` callbacks, by handlers
run later by `debounceEvent`, `throttleEvent`, and `rafEvent`, a synchronous
`scheduleRetry` throw, the rejection of its last attempt, and a throwing
`backoff` are reported with `reportError()`, like event
handler errors: a `window` `error` event fires and the rest of the scheduler
flush still runs. Hosts without `reportError()` (Node, jsdom) rethrow them from
a microtask.

`throttle(fn, ms, { leading: false })` waits the full `ms` after an idle gap
before running the trailing call.

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
