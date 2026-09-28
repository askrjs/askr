# Update Ordering

Askr serializes its queued work on one JavaScript thread. State writes become
visible immediately, while the DOM changes when the scheduled work commits.

## State writes and handlers

Calling a state setter changes the cell immediately. A getter read later in the
same handler sees the new value. The setter schedules subscribed components and
bindings; it does not update the DOM in the middle of the handler. Multiple
writes in one handler can be coalesced into one render of a subscriber.

Delegated browser events normally flush after the handler returns. Tests may
flush explicitly to observe a settled update. These guarantees describe work
scheduled by Askr; they do not prescribe the order in which timers, network
responses, or promises complete.

## Queued work

During a flush, Askr runs its internal work groups in a fixed sequence and
preserves insertion order within each group. It repeats the sequence while
work remains. Work added to a group that already ran in the current pass runs
in a later pass. These groups are an implementation detail, not an application
priority API. See [scheduler internals](../internals/runtime-reactivity.md#scheduler-lanes)
for the exact sequence.

## Failed renders

DOM commits are transactional. If a render or commit fails, Askr restores the
last committed DOM and retires ownership created by the failed attempt. The
state write remains; rollback does not undo the setter. An `ErrorBoundary` can
show a fallback, or the error is reported after queued work drains. A later
state change can schedule another render.

See [runtime enforcement](./runtime-enforcement.md) for render rules and
[rendering](../core/rendering.md) for commit and rollback behavior.
