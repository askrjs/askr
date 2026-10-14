# Navigation ownership

The router separates request ownership, resolution and publication through
private modules. The public `navigate` API and its history/scroll options are
unchanged.

| Owner                                                                | Responsibility                                                                                                                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `navigation-request.ts`                                              | Own the one active request ID/controller pair and teardown cancellation.                                                                                                                          |
| `navigation-resolution.ts`                                           | Snapshot registered apps, resolve auth/policies/loaders and await metadata; produce targets without changing roots, history or document metadata.                                                 |
| `navigation-targets.ts`                                              | Select redirects, unmatched document navigation, push/replace and popstate policy, then call the commit boundary.                                                                                 |
| `navigation-commit.ts`                                               | Prepare/apply every destination root, roll back failed or stale reversible work, publish roots, retire lifetimes, settle and publish location/metadata/history/scroll through supplied callbacks. |
| `navigation-registry.ts`, `history-index.ts`, `navigation-scroll.ts` | Retain registration, browser history positions and scroll/focus policy.                                                                                                                           |

Starting a request publishes its own ID/controller before aborting its
predecessor. Abort listeners may start or cancel another request synchronously.
The interrupted invocation returns its captured pair, so it cannot borrow the
newer's ID or replace its controller. Teardown clears the predecessor controller
before firing listeners, preserving ownership of any newer request they start.
The entry points check freshness again immediately after beginning a request,
before starting loaders or document navigation.

Resolution and metadata may finish after cancellation. Their targets remain
unpublished until the application boundary checks request freshness. A stale
target cannot change nodes, document title, history state or URL. The commit
boundary also checks freshness after reversible root application and after
lifecycle settlement, because rendering and lifecycle work can navigate.

Root application errors roll back all prepared roots before publishing any
root. Post-publication ref/cleanup failures follow the existing settlement
contract: the changed page remains committed and errors are reported. A history
write failure after publication does not revive a retired generation. Popstate
rollback traverses to the rendered entry or reloads when its position is unknown.
Every prepared root completes exactly once in the commit boundary's `finally`.

Architecture tests prevent resolution from acquiring commit/browser capabilities
and prevent back imports into the request owner. Direct seam tests resolve a
loaded root and denied root without publication, then apply the complete target
set. Reentrant abort probes and pending metadata probes supplement the existing
multi-root rollback, popstate, fallback, scroll/focus and browser suites.
