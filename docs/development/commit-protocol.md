# Shared commit protocol

Each runtime state owns a transaction coordinator. It has no component,
scheduler, or browser dependencies. Internal callers use `transaction-access.ts`;
published runtime and renderer extension contracts remain unchanged.

1. Preparation executes synchronous components and captures their pending
   reads and provisional scope state. A scheduled result can suspend until its
   existing scheduler lane applies it.
2. Application performs reversible DOM operations. Fragment placement,
   replacement ranges, retained elements, and hydration listeners register
   restoration with the enclosing transaction.
3. Publication installs subscriptions and committed collection membership,
   closes collection journals, and captures lifecycle queues for their exact
   owner. Nested successful transactions join their parent. They do not publish
   or run lifecycle callbacks independently.
4. Settlement drains departed owners, refs, portal writes, and then captured
   lifecycle operations. Errors belong to that transaction. A cleanup callback
   can start a fresh transaction after the previous publication has completed.

A failure before publication completes restores participants in reverse order
and drains provisional cleanup despite restoration errors. A failure after
publication does not reverse arbitrary user side effects. Discarding obsolete
work cannot restore a disposed owner or overwrite another active execution
frame. Scoped updates retain their previous subscriptions until the matching
output commits.

Optimized keyed reorders select different DOM work within this protocol. They
retain synchronous scheduler progress and defer derived invalidation and reader
notifications until settlement or restoration completes. State writes remain
visible immediately and survive rollback. Ordinary updates keep their existing
notification timing. The public scheduler probe remains available to extension
hosts.

Regression coverage includes nested commits, partial publication failure,
subscription restoration, fragment placement failure, retained listeners and
refs, collection cleanup reentrancy, owner replacement during cleanup, and
prepared scope reads. Run the public declaration and packed consumer fixtures
alongside unit, jsdom, seeded lifecycle, and all three browser suites. Benchmark
the touched lanes against refreshed main before accepting a structural change.
