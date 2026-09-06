export type CommitPhase =
  | 'preparing'
  | 'applying'
  | 'publishing'
  | 'settling'
  | 'discarding'
  | 'committed'
  | 'discarded'
  | 'joined';

/** Application and publication must be reversible. Settlement and activation
 * may invoke user code and are drained only after publication succeeds. */
export interface CommitParticipant {
  key?: object;
  kind?: object;
  apply?(): void;
  publish?(): void;
  settle?(): void;
  activate?(): void;
  /** Integration publication that must wait for all lifecycle callbacks. */
  complete?(): void;
  rollback?(): void;
  collision?: 'keep-first';
  merge?(parent: CommitParticipant): void;
}

interface CommitCoordinatorOptions {
  rollbackError?(error: unknown): void;
  settlementErrors?(errors: unknown[], transaction: CommitTransaction): void;
}

interface TransactionState {
  phase: CommitPhase;
  parent: CommitTransaction | null;
  coordinator: CommitCoordinator;
  participants: CommitParticipant[];
  seen: Set<CommitParticipant> | undefined;
  index: Map<object | undefined, Map<object, CommitParticipant>> | undefined;
  resources: Map<object, unknown> | undefined;
  errors: unknown[] | undefined;
  completions: Map<object, () => void> | undefined;
  deferNotifications: boolean;
}

const transactionCreation = Symbol('transaction creation');
let transactionState: (transaction: CommitTransaction) => TransactionState;

/** Read-only transaction identity with explicit resource and notification operations. */
export class CommitTransaction {
  readonly #state: TransactionState;

  static {
    transactionState = (transaction) => transaction.#state;
  }

  constructor(
    coordinator: CommitCoordinator,
    parent: CommitTransaction | null,
    token: symbol
  ) {
    if (token !== transactionCreation)
      throw new Error(
        '[Askr] Transactions must be created by their coordinator.'
      );
    this.#state = {
      phase: 'preparing',
      parent,
      coordinator,
      participants: [],
      seen: undefined,
      index: undefined,
      resources: undefined,
      errors: undefined,
      completions: undefined,
      deferNotifications: false,
    };
    Object.freeze(this);
  }

  get phase(): CommitPhase {
    return this.#state.phase;
  }
  get parent(): CommitTransaction | null {
    return this.#state.parent;
  }
  get coordinator(): CommitCoordinator {
    return this.#state.coordinator;
  }
  get participants(): readonly CommitParticipant[] {
    return Object.freeze(this.#state.participants.slice());
  }
  get errors(): readonly unknown[] {
    return Object.freeze(this.#state.errors?.slice() ?? []);
  }
  get resourceCount(): number {
    return this.#state.resources?.size ?? 0;
  }
  /** Detached diagnostic collections cannot mutate coordinator bookkeeping. */
  inspect(): {
    index: ReadonlyMap<
      object | undefined,
      ReadonlyMap<object, CommitParticipant>
    >;
    resources: ReadonlyMap<object, unknown>;
    seen: ReadonlySet<CommitParticipant>;
    completions: ReadonlyMap<object, () => void>;
  } {
    return {
      index: new Map(
        Array.from(this.#state.index ?? [], ([kind, entries]) => [
          kind,
          new Map(entries),
        ])
      ),
      resources: new Map(this.#state.resources),
      seen: new Set(this.#state.seen),
      completions: new Map(this.#state.completions),
    };
  }
  get active(): boolean {
    const phase = this.#state.phase;
    return (
      phase === 'preparing' || phase === 'applying' || phase === 'publishing'
    );
  }

  hasResource(key: object): boolean {
    return this.#state.resources?.has(key) ?? false;
  }
  resource<T = unknown>(key: object): T | undefined {
    return this.#state.resources?.get(key) as T | undefined;
  }
  captureResource<T>(key: object, resource: T): T {
    if (!this.active)
      throw new Error(
        '[Askr] Cannot capture a resource on a settled transaction.'
      );
    const resources = (this.#state.resources ??= new Map());
    if (resources.has(key)) return resources.get(key) as T;
    resources.set(key, resource);
    return resource;
  }
  setDeferredNotifications(enabled: boolean): void {
    if (!this.active)
      throw new Error('[Askr] Cannot configure a settled transaction.');
    this.#state.deferNotifications = enabled;
  }
  participant<T extends CommitParticipant>(
    key: object,
    kind?: object
  ): T | undefined {
    return this.#state.index?.get(kind)?.get(key) as T | undefined;
  }
}

/** One synchronous stack per runtime. This coordinator has no component,
 * subscription, renderer, scheduler, or browser dependencies. */
export class CommitCoordinator {
  private frame: CommitTransaction | null = null;
  private readonly options: CommitCoordinatorOptions;

  constructor(options: CommitCoordinatorOptions = {}) {
    this.options = options;
  }

  get current(): CommitTransaction | null {
    return this.frame;
  }

  begin(): CommitTransaction {
    const transaction = new CommitTransaction(
      this,
      this.frame?.active ? this.frame : null,
      transactionCreation
    );
    this.frame = transaction;
    return transaction;
  }

  register(participant: CommitParticipant): boolean {
    if (!this.frame?.active) return false;
    this.add(this.frame, participant);
    return true;
  }

  private add(
    transaction: CommitTransaction,
    participant: CommitParticipant
  ): void {
    const state = transactionState(transaction);
    if (state.seen?.has(participant)) return;
    if (participant.key) {
      const kinds = (state.index ??= new Map<
        object | undefined,
        Map<object, CommitParticipant>
      >());
      let index = kinds.get(participant.kind);
      if (!index) kinds.set(participant.kind, (index = new Map()));
      const previous = index.get(participant.key);
      if (previous) {
        this.validateCollision(previous, participant);
        if (previous === participant) return;
        if (participant.collision === 'keep-first') {
          (state.seen ??= new Set()).add(participant);
          return;
        }
        try {
          participant.merge!(previous);
          (state.seen ??= new Set()).add(participant);
        } catch (error) {
          state.participants.push(participant);
          this.discardMergedTransactions(transaction);
          throw error;
        }
        return;
      }
      index.set(participant.key, participant);
    } else {
      (state.seen ??= new Set()).add(participant);
    }
    state.participants.push(participant);
  }

  private validateCollision(
    previous: CommitParticipant,
    participant: CommitParticipant
  ): void {
    if (
      previous !== participant &&
      participant.collision !== 'keep-first' &&
      !participant.merge
    )
      throw new Error(
        '[Askr] Participant collision requires merge or keep-first.'
      );
  }

  private discardMergedTransactions(
    transaction: CommitTransaction,
    mergedParent?: CommitTransaction
  ): void {
    const state = transactionState(transaction);
    const affected = new Set([transaction]);
    const participants = new Set(state.participants);
    const ancestors: CommitTransaction[] = [];
    for (
      let ancestor = state.parent;
      ancestor;
      ancestor = transactionState(ancestor).parent
    )
      if (ancestor.active) ancestors.push(ancestor);
    let changed: boolean;
    do {
      changed = false;
      for (const ancestor of ancestors) {
        if (
          !affected.has(ancestor) &&
          (ancestor === mergedParent ||
            transactionState(ancestor).participants.some((participant) =>
              participants.has(participant)
            ))
        ) {
          affected.add(ancestor);
          changed = true;
          for (const participant of transactionState(ancestor).participants)
            participants.add(participant);
        }
      }
    } while (changed);
    const frames = [
      transaction,
      ...ancestors.filter((ancestor) => affected.has(ancestor)),
    ];

    // Invalidate every affected frame before user rollback callbacks can
    // reenter one. The oldest owner drains each shared participant once.
    const owners = new Set<CommitParticipant>();
    for (let index = frames.length - 1; index >= 0; index--) {
      const frame = frames[index];
      transactionState(frame).phase = 'discarding';
      for (
        let member = transactionState(frame).participants.length - 1;
        member >= 0;
        member--
      ) {
        const participant = transactionState(frame).participants[member];
        if (owners.has(participant))
          transactionState(frame).participants.splice(member, 1);
        else owners.add(participant);
      }
    }
    for (const frame of frames) this.drainRollback(frame);
  }

  suspend(transaction: CommitTransaction): void {
    const state = transactionState(transaction);
    this.assertOwned(transaction);
    if (this.frame === transaction) this.frame = this.liveFrame(state.parent);
  }

  apply<T>(transaction: CommitTransaction, operation: () => T): T {
    const state = transactionState(transaction);
    this.assertOwned(transaction);
    if (!transaction.active)
      throw new Error('[Askr] Cannot apply a settled transaction.');
    const previous = this.frame;
    const previousPhase = state.phase;
    if (previous && previous !== transaction && previous.active) {
      let ancestor: CommitTransaction | null = previous;
      while (ancestor && ancestor !== transaction)
        ancestor = transactionState(ancestor).parent;
      if (!ancestor) state.parent = previous;
    }
    this.frame = transaction;
    state.phase = 'applying';
    try {
      return operation();
    } finally {
      if (transaction.active) state.phase = previousPhase;
      this.frame = this.liveFrame(previous);
    }
  }

  /** State writes survive rollback. Their notifications wait until all
   * framework restoration or post-commit work has finished. */
  deferCompletion(key: object, complete: () => void): boolean {
    const transaction = this.frame;
    if (!transaction || !this.notificationsDeferred()) return false;
    const state = transactionState(transaction);
    (state.completions ??= new Map()).set(key, complete);
    return true;
  }

  notificationsDeferred(): boolean {
    let transaction = this.frame;
    while (transaction) {
      if (
        transactionState(transaction).deferNotifications &&
        (transaction.active ||
          transactionState(transaction).phase === 'discarding')
      )
        return true;
      transaction = transactionState(transaction).parent;
    }
    return false;
  }

  commit(transaction: CommitTransaction): void {
    const state = transactionState(transaction);
    this.assertOwned(transaction);
    if (!transaction.active) return;
    const parent = state.parent;
    if (parent?.active) {
      const parentState = transactionState(parent);
      let needsMerge = false;
      let changedIdentity = false;
      for (const participant of state.participants) {
        // Retained keyed records are indexed, not tracked in seen. A keyed
        // member in seen may have been registered before its key was assigned.
        if (participant.key && state.seen?.has(participant))
          changedIdentity = true;
        if (parentState.seen?.has(participant)) continue;
        const previous = participant.key
          ? parent.participant(participant.key, participant.kind)
          : undefined;
        if (previous) {
          this.validateCollision(previous, participant);
          if (
            previous !== participant &&
            participant.collision !== 'keep-first'
          )
            needsMerge = true;
        }
      }
      for (const [kind, index] of state.index?.entries() ?? []) {
        index.forEach((participant, key) => {
          if (participant.key !== key || participant.kind !== kind)
            changedIdentity = true;
        });
        if (changedIdentity) break;
      }
      if (needsMerge || changedIdentity) {
        // Merges can register further work. Keep their dynamic traversal and
        // failure ownership separate from callback-free membership transfer.
        try {
          for (const participant of state.participants) {
            if (parentState.seen?.has(participant)) continue;
            const previous = participant.key
              ? parent.participant(participant.key, participant.kind)
              : undefined;
            if (previous && previous !== participant) {
              if (participant.collision !== 'keep-first')
                participant.merge!(previous);
              (parentState.seen ??= new Set()).add(participant);
            }
          }
        } catch (error) {
          this.discardMergedTransactions(transaction, parent);
          throw error;
        }
        // A changed key can leave the same record in multiple child slots.
        // Registration preserves identity deduplication in that uncommon case.
        for (const participant of state.participants) {
          if (
            !participant.key ||
            !parent.participant(participant.key, participant.kind)
          )
            this.add(parent, participant);
        }
      } else {
        for (const participant of state.participants) {
          if (parentState.seen?.has(participant)) {
            if (participant.key)
              state.index!.get(participant.kind)!.delete(participant.key);
            continue;
          }
          if (participant.key) {
            const previous = parent.participant(
              participant.key,
              participant.kind
            );
            if (previous) {
              if (previous !== participant)
                (state.seen ??= new Set()).add(participant);
              continue;
            }
          }
          parentState.participants.push(participant);
        }

        // Inner indexes have no independent owner. Keep the larger allocation;
        // parent entries retain collision ownership regardless of map choice.
        // Child release drops only the outer index after ownership transfers.
        for (const [kind, index] of state.index?.entries() ?? []) {
          if (!index.size) continue;
          const kinds = (parentState.index ??= new Map<
            object | undefined,
            Map<object, CommitParticipant>
          >());
          const existing = kinds.get(kind);
          if (!existing) kinds.set(kind, index);
          else if (existing.size < index.size) {
            existing.forEach((participant, key) => index.set(key, participant));
            kinds.set(kind, index);
          } else {
            index.forEach((participant, key) => {
              if (!existing.has(key)) existing.set(key, participant);
            });
          }
        }
      }
      if (
        state.resources &&
        !needsMerge &&
        !changedIdentity &&
        (parentState.resources?.size ?? 0) < state.resources.size
      ) {
        const previousResources = parentState.resources;
        parentState.resources = state.resources;
        state.resources = previousResources;
        // Parent values are the earlier snapshots, including explicit undefined.
        for (const [key, value] of previousResources ?? [])
          parentState.resources.set(key, value);
      } else if (state.resources) {
        const resources = (parentState.resources ??= new Map());
        for (const [key, value] of state.resources) {
          if (!resources.has(key)) resources.set(key, value);
        }
      }
      if (state.seen) {
        // The joined child relinquishes its set. Reuse the larger allocation
        // while retaining identities coalesced in either frame.
        if (!parentState.seen) parentState.seen = state.seen;
        else if (parentState.seen.size < state.seen.size) {
          for (const participant of parentState.seen)
            state.seen.add(participant);
          parentState.seen = state.seen;
        } else {
          for (const participant of state.seen)
            parentState.seen.add(participant);
        }
      }
      this.mergeCompletions(transaction, parent);
      state.phase = 'joined';
      this.suspend(transaction);
      this.release(transaction);
      return;
    }

    const previous = this.frame;
    this.frame = transaction;
    let applied = 0;
    let published = 0;
    try {
      // A nested render from an application hook can append participants.
      // Apply those before allowing their publication, including additions
      // made while another participant is publishing framework bookkeeping.
      while (
        applied < state.participants.length ||
        published < state.participants.length
      ) {
        state.phase = 'applying';
        while (applied < state.participants.length)
          state.participants[applied++]!.apply?.();
        state.phase = 'publishing';
        if (published < state.participants.length)
          state.participants[published++]!.publish?.();
      }
    } catch (error) {
      this.discard(transaction);
      throw error;
    } finally {
      this.frame = this.liveFrame(
        previous === transaction ? state.parent : previous
      );
    }

    state.phase = 'settling';
    try {
      for (const phase of ['settle', 'activate', 'complete'] as const) {
        for (const participant of state.participants) {
          try {
            participant[phase]?.();
          } catch (error) {
            (state.errors ??= []).push(error);
          }
        }
      }
      this.complete(transaction, (error) => (state.errors ??= []).push(error));
      state.phase = 'committed';
      if (state.errors?.length)
        this.options.settlementErrors?.(state.errors, transaction);
    } finally {
      state.phase = 'committed';
      this.release(transaction);
    }
  }

  discard(transaction: CommitTransaction): void {
    this.assertOwned(transaction);
    if (!transaction.active) return;
    this.drainRollback(transaction);
  }

  private drainRollback(transaction: CommitTransaction): void {
    const state = transactionState(transaction);
    const previous = this.frame;
    this.frame = transaction;
    state.phase = 'discarding';
    const report = (error: unknown): void => {
      try {
        this.options.rollbackError?.(error);
      } catch {
        /* Preserve the initiating failure. */
      }
    };
    try {
      for (let index = state.participants.length - 1; index >= 0; index--) {
        try {
          state.participants[index]!.rollback?.();
        } catch (error) {
          report(error);
        }
      }
    } finally {
      state.phase = 'discarded';
      this.frame = this.liveFrame(
        previous === transaction ? state.parent : previous
      );
      if (state.parent?.active || state.parent?.phase === 'discarding')
        this.mergeCompletions(transaction, state.parent);
      else this.complete(transaction, report);
      this.release(transaction);
    }
  }

  private mergeCompletions(
    transaction: CommitTransaction,
    parent: CommitTransaction
  ): void {
    const state = transactionState(transaction);
    if (!state.completions) return;
    const parentState = transactionState(parent);
    const completions = (parentState.completions ??= new Map());
    for (const [key, complete] of state.completions)
      completions.set(key, complete);
  }

  private complete(
    transaction: CommitTransaction,
    report: (error: unknown) => void
  ): void {
    const state = transactionState(transaction);
    for (const complete of state.completions?.values() ?? []) {
      try {
        complete();
      } catch (error) {
        report(error);
      }
    }
  }

  private release(transaction: CommitTransaction): void {
    const state = transactionState(transaction);
    state.participants.length = 0;
    state.seen = undefined;
    state.index = undefined;
    state.resources = undefined;
    state.completions?.clear();
    state.completions = undefined;
  }

  private liveFrame(
    transaction: CommitTransaction | null
  ): CommitTransaction | null {
    while (transaction && !transaction.active)
      transaction = transactionState(transaction).parent;
    return transaction;
  }

  private assertOwned(transaction: CommitTransaction): void {
    if (transactionState(transaction).coordinator !== this)
      throw new Error('[Askr] Transaction belongs to another runtime.');
  }
}
