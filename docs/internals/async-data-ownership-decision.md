# Async data ownership (#492)

Status: **decided for the current core**. This decision keeps the existing
public overloads and hydration envelope. It does not publish a new API.

## One input rule, three lifetimes

Use a source getter as the primary way to express changing inputs to
component-owned async work:

| Primitive                        | Canonical input                           | Owner and identity                        | Result                                       |
| -------------------------------- | ----------------------------------------- | ----------------------------------------- | -------------------------------------------- |
| `resource(source, load)`         | Read `source` during the component render | One component hook slot; no cache sharing | One value, with pending/error/refresh        |
| `stream(source, connect)`        | Read `source` during the component render | One component hook slot; no cache sharing | Async iterable, with reconnect/close         |
| `createQuery(definition, input)` | Derive an explicit query key from input   | Shared by key within a `DataRuntime`      | Cached value with freshness and invalidation |

The source getter makes the component subscribe to the state it reads. A
changed input starts new work only after that render commits. The old work is
aborted through `AbortController`, and its late result cannot publish. A failed
render leaves the prior input and work in force. `resource(loader, deps)` and
`stream(connect, { deps })` remain supported for existing callers; new examples
use source getters. A loader without a source or deps runs once until
`refresh()` or `restart()` is called.

Do not implement `resource()` as a thin query. A resource's lifetime ends with
its component and `refresh()` cancels its own work. A query can have multiple
readers, a retained cache entry, runtime-scoped invalidation, and consistency
states. A stream holds an open iterator and may publish many values from one
connection. Sharing one cache or result type would change those contracts.
Callers wanting shared server data should use a query; callers wanting owned
request or subscription work should use a resource or stream.

## Server identity

The version 1 `PageRenderEnvelope` uses a typed identity: the pair of an entry
kind and its key. `resources` contains render-order slots (`r:0`, `r:1`, ...),
while `queries` contains explicit data-runtime keys. Those buckets cannot
collide even if a query is named `r:0`. A stream has no dehydrated connection;
SSR uses its supplied initial value. Both resource overloads use the same
render-order slot scheme, so choosing a source getter does not alter hydration
data or packed consumers.

An explicit resource key would need a versioned envelope and a migration for
preloaded data, nested renders, and hydration verification. No such migration
is needed to settle input ownership, so the current render-order keys remain.
Changing the key format independently would make existing server payloads
unreadable by this client version.

## Compatibility and qualification

Keep the deps overloads until a separately versioned API migration is chosen.
Do not silently turn `resource(loader, deps)` into a cached query or infer
dependencies from the loader's asynchronous continuation. The source getter is
read synchronously during render; the `signal` is forwarded to the loader or
connector, and async continuations must carry any needed runtime explicitly.

The existing source-driven resource and stream regressions, query sharing and
invalidation tests, SSR resource-order and concurrent-render tests, hydration
envelope tests, and packed-consumer gate qualify this decision. A future key
format or removal of a deps overload needs its own red regressions, downstream
smoke tests, and migration notes.
