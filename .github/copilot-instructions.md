# Abort & Cancellation guidance — concise, practical, and future-proof

Short version: **Don’t invent a new cancellation primitive — use AbortController.**

AbortController is a web platform primitive that is:

- Standard and well-understood
- Framework-agnostic and interoperable
- Easy for tools and AI to reason about

It expresses cancellation clearly without adding a new concept to learn.

## Why this matters for the runtime

Askr (the runtime) should decide _when_ to stop work (unmounts, route changes, replacements) but should not reinvent _how_ to signal cancellation. The runtime should:

- create and own an AbortController per logical unit (component, fetch, or task)
- abort the controller when that unit is torn down
- forward the controller.signal into user code and standard APIs (fetch, streams)

This keeps user code idiomatic and minimizes framework surface area.

## Recommended patterns (do)

- Use `AbortController` directly in user code when needed:

```ts
export async function User({ id }) {
  const controller = new AbortController();

  onUnmount(() => controller.abort());

  const user = await fetch(`/api/users/${id}`, {
    signal: controller.signal,
  });

  return <UserView user={user} />;
}
```

- Let the runtime provide a `context.signal` when convenient (optional optimization):

```ts
export async function User({ id }, { signal }) {
  const user = await fetch(`/api/users/${id}`, { signal });
  return <UserView user={user} />;
}
```

- Name the forwarded property `signal` (standard) and document when it is aborted (on unmount / replace).

## What to avoid (don’t)

- Don’t introduce a new primitive like `useAbort()` or `AbortRef` unless there is a very strong, documented reason.
- Don’t wrap fetch or other platform APIs to hide the signal; forwarding `signal` keeps code straightforward.
- Don’t auto-abort user Promises in a way that changes their semantics; prefer explicit abort behavior and document it.

These patterns leak runtime intent and make reasoning (and debugging) harder.

## Testing & documentation checklist

- Add tests that assert controllers are aborted when the associated unit is torn down.
- Document whether `signal` is provided by the runtime and under which lifecycle it is aborted.
- Provide a short test template and example to show contributors the expected pattern.

## Final guidance

If the platform already provides a clean solution, use it — don’t reimplement it. AbortController is that solution for cancellation: rely on it, propagate its `signal` through your APIs, and keep Askr’s API minimal.

✔️ Use `AbortController`
✔️ Prefer `signal` forwarding
✔️ Keep runtime ergonomics simple (runtime-owned `signal` is an optimization, not a requirement)

If you want, I can add a test template and a short example in `tests/` to make it easy for contributors to follow the pattern.
