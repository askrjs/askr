# Root, data, and server integration

The router resolves destinations, policies, loaders, metadata, history, and
scroll decisions. It passes an opaque root and destination to the root-update
host installed by boot. It does not copy component fields or traverse renderer
metadata. Boot combines runtime-owned generation preparation with a
renderer-owned host snapshot and request data context.

Push navigation and popstate use the same root transaction. Replacement roots
render before same-path refreshes, preserving their scheduler ordering. Every
root must apply successfully before route registration publishes. Failed
pre-publication work restores all prepared roots and registrations through the
shared coordinator. Popstate restoration also restores the previous history
entry. Retired generations drain during settlement; retained layouts and query
refreshes keep their current lifetimes.

History, reactive location, metadata, and scroll complete after lifecycle work.
A lifecycle callback may start a newer navigation. The superseded transaction
still drains its departed owners and releases its staged location, but cannot
overwrite the newer destination. Navigation nested inside another transaction
waits for that transaction's publication and settlement. It cannot retire owners
or publish history independently.

Data integrations use runtime capabilities to identify the current lifetime and
attach cleanup. The existing data runtime remains the only query cache owner.
Query and mutation attachment stores remain keyed by lifetime identity; request
generations and abort signals retain their existing cancellation semantics.
Route-change hooks share the runtime's lifecycle slot store and cleanup path.

SSR owns explicit request context, including resolved authentication, data,
styles, portals, and deferred output. Concurrent Node requests use async-local
storage. The synchronous fallback restores its context through `finally` and
rejects asynchronous use. Temporary server components enter the runtime's
execution scope with their own hook cursor and restore the surrounding cursor,
component, and portal scope even when a nested render throws. Hydration
verification uses the authentication attached to the resolved route, and
stream cancellation continues to forward the request's abort signal.

Validation includes coordinated root rollback, shared layouts, query-only
refresh, lifecycle-triggered navigation, enclosing transaction discard,
request/cache isolation, resolved-auth hydration, stream cancellation, and
nested SSR success and failure. Public declarations and packed consumer
fixtures cover the published boundary.
