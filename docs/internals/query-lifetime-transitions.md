# Query lifetime and async transitions

`QueryLifetime` owns attached reader/hook slots, the current reader definition,
conflict warnings, cache identity and the inactive/ownerless cache timers.
`QueryCell` owns fetch generations/controllers, queued refresh promises/tokens,
reconciliation sequences and published query state. A private capability contract
lets reader lifetime invoke fetch retirement and state changes without importing
the async publication implementation.

An operation captures its generation and controller once. `QueryCell.isCurrent`
checks both identities and cell liveness; it is the single authority used to
continue async work and publish through `setState`. Publication checks again after
user callback evaluation, including error normalization. Synchronous intent changes
such as marking a pending write use the same state publisher with the cell's live
lifetime rather than a captured fetch operation.

| Transition               | Reader/cache lifetime                                                                                                               | Fetch authority and promise                                                                                                       | Published state                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Initial load             | A new cell registers by key; readers attach and define callbacks.                                                                   | Queue an initial token unless data exists or initial fetching is skipped. Start captures a new generation/controller.             | Loading, then fresh/error if that operation remains current.                                    |
| Manual refresh           | An inactive retained cell is retired rather than fetching through a departed definition.                                            | Coalesce equivalent manual work; supersede a pending invalidation. Capture callbacks when the new fetch starts.                   | Loading without data, otherwise refreshing; current completion becomes fresh/error.             |
| Invalidation             | Existing live cache identity remains.                                                                                               | Revoke the running generation synchronously and replace its queued token while retaining the shared refresh promise.              | Current loading/refreshing intent; obsolete fetch or consistency results do not publish.        |
| Reconcile retry          | Readers and their definition stay attached.                                                                                         | Retry only for the current operation and sequence, after the bounded delay. Recheck after abort listeners before queuing a retry. | Inconsistent data remains stale until a current retry settles; retry limit remains three.       |
| Abort                    | Reader detach, replacement or fetch cancellation determines whether the cell remains live.                                          | Retired generations cannot publish even when their fetch ignores the signal. An obsolete start stops before calling transport.    | A current abort keeps cached data stale with reason `aborted`; without data it remains loading. |
| Last reader detaches     | Destroy immediately for zero retention, no data or SSR; otherwise retain the cache entry and clear its definition owner.            | Retire running and queued authority, settle pending refresh, then install the GC timer before firing abort listeners.             | Retained refreshing data becomes stale/aborted.                                                 |
| Reader reattaches        | Cancel both cache timers, attach once by owner/hook slot and define the current callbacks.                                          | Retained data stays usable; no departed reader's operation regains authority.                                                     | Retained snapshot remains until a new current refresh.                                          |
| Remaining reader handoff | Detach removes only that slot. A surviving defined reader takes over callbacks if the departing reader owned the definition.        | A running fetch keeps its captured callbacks; later fetches use the surviving definition.                                         | Existing state is preserved.                                                                    |
| Inactive cache eviction  | Mark destroyed, clear timers and delete only this cell's cache identity before firing abort listeners; then clear departed readers. | Retire work and settle pending refresh; current checks reject all late completions.                                               | Destroyed handles stop publishing.                                                              |
| Ownerless lookup expiry  | Remove only this cell's lookup identity, retaining the handle itself. SSR never schedules this timer.                               | Ownerless handles remain usable; a later cache replacement is independent.                                                        | A held ownerless handle can still refresh its own state.                                        |

The controller for a new operation becomes current before its predecessor's abort
listeners run. A listener may synchronously invalidate the query; the start checks
authority again before invoking its transport. Reconciliation likewise checks after
aborting its own controller, so an old retry cannot replace newer invalidation work.

Cache retirement happens before destruction abort listeners run. A new reader for
the same key therefore receives a live replacement when retention is zero. With a
retention window, reattachment cancels the old deadline and keeps the same live cell.

The reader/cache module retains the original definition conflict timing, callback
identity rules, timer validation and promotion behavior. Architecture assertions
forbid runtime dependencies back into query-cell/state/publication modules. Public
query APIs and state shapes remain unchanged.

Qualification includes the existing query/data and operations suites, late resolve
and reject admission cases, multiple-reader cleanup, ownerless handles and SSR
definitions. Six callback-generation cases cover consistency invalidation, canceled
replacement errors, start/reconciliation abort listener reentry and the succeeding
generation's signal/result. A reader transition case reattaches from an abort
listener, verifies cache retention past the old deadline, ignores obsolete data,
refreshes through the surviving reader and finally evicts after that reader leaves.

The same transition with zero retention verifies a fresh live cache identity replaces
the destroyed cell and remains usable through refresh and final release.
