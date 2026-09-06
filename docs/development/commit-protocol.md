# Shared commit protocol

Each runtime state owns a transaction coordinator. It has no component,
scheduler, or browser dependencies. Internal callers use `runtime/transactions/access.ts`;
published runtime and renderer extension contracts remain unchanged.

Transaction handles expose read-only phase and parent information. The
coordinator privately owns phase transitions, participant indexes, resources,
and completion queues. Diagnostic collections are detached copies, so inspection
cannot erase pending work. Resource capture admits the first value for a key,
including `undefined`; notification deferral uses an explicit operation. Both
operations reject settled transactions. Nested joins retain their existing
collision policy, resource precedence, and reverse rollback order.

Component host synchronization, range replacement, and standalone host pruning
enter through `runCommitOperation`. The boundary reuses an active transaction
or creates and drains one for the entire operation. Replacement participants
require this boundary and never execute a separate apply/publish/settle fallback.
An unsuccessful standalone adoption therefore preserves outgoing owners, and
a failed retained update restores its execution state just like a nested update.

The runtime's retained-update preparation owns snapshot capture and execution
mutation together. The renderer supplies vnode identity, context, and props;
the runtime applies parent attachment and retained execution fields before
component evaluation. Renderer key resolution remains lazy to preserve getter
ordering relative to snapshot capture and identity mutation.

Retained-owner collections remain live during preparation so nested resolution
can add successful wrappers. Replacement closes that collection at publication;
retirement uses the published membership even if a settlement callback mutates
the original collection. Rollback before publication still sees provisional
preparation state.

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
   Integration completion follows all lifecycle activation, allowing navigation
   to publish history only if its request is still current. These callbacks
   also join enclosing transactions and never run after rollback.

A failure before publication completes restores participants in reverse order
and drains provisional cleanup despite restoration errors. A failure after
publication does not reverse arbitrary user side effects. Discarding obsolete
work cannot restore a disposed owner or overwrite another active execution
frame. Render revisions invalidate older prepared output when the same lifetime
executes again; lifetime identity and async evaluation revisions remain separate.
Extension hosts that decline range replacement retain the previous owner if
placeholder publication fails, while provisional descendants are drained.
Scoped updates retain their previous subscriptions until the matching
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
