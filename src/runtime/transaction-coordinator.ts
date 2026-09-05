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

export class CommitTransaction {
  phase: CommitPhase = 'preparing';
  parent: CommitTransaction | null;
  readonly coordinator: CommitCoordinator;
  readonly participants: CommitParticipant[] = [];
  /** Identities not already represented by the keyed index. */
  seen: Set<CommitParticipant> | undefined;
  readonly index = new Map<
    object | undefined,
    Map<object, CommitParticipant>
  >();
  resources = new Map<object, unknown>();
  readonly errors: unknown[] = [];
  completions: Map<object, () => void> | undefined;
  deferNotifications = false;

  constructor(
    coordinator: CommitCoordinator,
    parent: CommitTransaction | null
  ) {
    this.coordinator = coordinator;
    this.parent = parent;
  }

  get active(): boolean {
    return (
      this.phase === 'preparing' ||
      this.phase === 'applying' ||
      this.phase === 'publishing'
    );
  }

  participant<T extends CommitParticipant>(
    key: object,
    kind?: object
  ): T | undefined {
    return this.index.get(kind)?.get(key) as T | undefined;
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
      this.frame?.active ? this.frame : null
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
    if (transaction.seen?.has(participant)) return;
    if (participant.key) {
      let index = transaction.index.get(participant.kind);
      if (!index) transaction.index.set(participant.kind, (index = new Map()));
      const previous = index.get(participant.key);
      if (previous) {
        this.validateCollision(previous, participant);
        if (previous === participant) return;
        if (participant.collision === 'keep-first') {
          (transaction.seen ??= new Set()).add(participant);
          return;
        }
        try {
          participant.merge!(previous);
          (transaction.seen ??= new Set()).add(participant);
        } catch (error) {
          transaction.participants.push(participant);
          this.discardMergedTransactions(transaction);
          throw error;
        }
        return;
      }
      index.set(participant.key, participant);
    } else {
      (transaction.seen ??= new Set()).add(participant);
    }
    transaction.participants.push(participant);
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
    const affected = new Set([transaction]);
    const participants = new Set(transaction.participants);
    const ancestors: CommitTransaction[] = [];
    for (
      let ancestor = transaction.parent;
      ancestor;
      ancestor = ancestor.parent
    )
      if (ancestor.active) ancestors.push(ancestor);
    let changed: boolean;
    do {
      changed = false;
      for (const ancestor of ancestors) {
        if (
          !affected.has(ancestor) &&
          (ancestor === mergedParent ||
            ancestor.participants.some((participant) =>
              participants.has(participant)
            ))
        ) {
          affected.add(ancestor);
          changed = true;
          for (const participant of ancestor.participants)
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
      frame.phase = 'discarding';
      for (let member = frame.participants.length - 1; member >= 0; member--) {
        const participant = frame.participants[member];
        if (owners.has(participant)) frame.participants.splice(member, 1);
        else owners.add(participant);
      }
    }
    for (const frame of frames) this.drainRollback(frame);
  }

  suspend(transaction: CommitTransaction): void {
    this.assertOwned(transaction);
    if (this.frame === transaction)
      this.frame = this.liveFrame(transaction.parent);
  }

  apply<T>(transaction: CommitTransaction, operation: () => T): T {
    this.assertOwned(transaction);
    if (!transaction.active)
      throw new Error('[Askr] Cannot apply a settled transaction.');
    const previous = this.frame;
    const previousPhase = transaction.phase;
    if (previous && previous !== transaction && previous.active) {
      let ancestor: CommitTransaction | null = previous;
      while (ancestor && ancestor !== transaction) ancestor = ancestor.parent;
      if (!ancestor) transaction.parent = previous;
    }
    this.frame = transaction;
    transaction.phase = 'applying';
    try {
      return operation();
    } finally {
      if (transaction.active) transaction.phase = previousPhase;
      this.frame = this.liveFrame(previous);
    }
  }

  /** State writes survive rollback. Their notifications wait until all
   * framework restoration or post-commit work has finished. */
  deferCompletion(key: object, complete: () => void): boolean {
    const transaction = this.frame;
    if (!transaction || !this.notificationsDeferred()) return false;
    (transaction.completions ??= new Map()).set(key, complete);
    return true;
  }

  notificationsDeferred(): boolean {
    let transaction = this.frame;
    while (transaction) {
      if (
        transaction.deferNotifications &&
        (transaction.active || transaction.phase === 'discarding')
      )
        return true;
      transaction = transaction.parent;
    }
    return false;
  }

  commit(transaction: CommitTransaction): void {
    this.assertOwned(transaction);
    if (!transaction.active) return;
    const parent = transaction.parent;
    if (parent?.active) {
      let needsMerge = false;
      let changedIdentity = false;
      for (const participant of transaction.participants) {
        // Retained keyed records are indexed, not tracked in seen. A keyed
        // member in seen may have been registered before its key was assigned.
        if (participant.key && transaction.seen?.has(participant))
          changedIdentity = true;
        if (parent.seen?.has(participant)) continue;
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
      for (const [kind, index] of transaction.index) {
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
          for (const participant of transaction.participants) {
            if (parent.seen?.has(participant)) continue;
            const previous = participant.key
              ? parent.participant(participant.key, participant.kind)
              : undefined;
            if (previous && previous !== participant) {
              if (participant.collision !== 'keep-first')
                participant.merge!(previous);
              (parent.seen ??= new Set()).add(participant);
            }
          }
        } catch (error) {
          this.discardMergedTransactions(transaction, parent);
          throw error;
        }
        // A changed key can leave the same record in multiple child slots.
        // Registration preserves identity deduplication in that uncommon case.
        for (const participant of transaction.participants) {
          if (
            !participant.key ||
            !parent.participant(participant.key, participant.kind)
          )
            this.add(parent, participant);
        }
      } else {
        for (const participant of transaction.participants) {
          if (parent.seen?.has(participant)) {
            if (participant.key)
              transaction.index.get(participant.kind)!.delete(participant.key);
            continue;
          }
          if (participant.key) {
            const previous = parent.participant(
              participant.key,
              participant.kind
            );
            if (previous) {
              if (previous !== participant)
                (transaction.seen ??= new Set()).add(participant);
              continue;
            }
          }
          parent.participants.push(participant);
        }

        // Inner indexes have no independent owner. Keep the larger allocation;
        // parent entries retain collision ownership regardless of map choice.
        // Child release clears only the outer index after ownership transfers.
        for (const [kind, index] of transaction.index) {
          if (!index.size) continue;
          const existing = parent.index.get(kind);
          if (!existing) parent.index.set(kind, index);
          else if (existing.size < index.size) {
            existing.forEach((participant, key) => index.set(key, participant));
            parent.index.set(kind, index);
          } else {
            index.forEach((participant, key) => {
              if (!existing.has(key)) existing.set(key, participant);
            });
          }
        }
      }
      if (
        !needsMerge &&
        !changedIdentity &&
        parent.resources.size < transaction.resources.size
      ) {
        const previousResources = parent.resources;
        parent.resources = transaction.resources;
        transaction.resources = previousResources;
        // Parent values are the earlier snapshots, including explicit undefined.
        for (const [key, value] of previousResources)
          parent.resources.set(key, value);
      } else {
        for (const [key, value] of transaction.resources) {
          if (!parent.resources.has(key)) parent.resources.set(key, value);
        }
      }
      if (transaction.seen) {
        // The joined child relinquishes its set. Reuse the larger allocation
        // while retaining identities coalesced in either frame.
        if (!parent.seen) parent.seen = transaction.seen;
        else if (parent.seen.size < transaction.seen.size) {
          for (const participant of parent.seen)
            transaction.seen.add(participant);
          parent.seen = transaction.seen;
        } else {
          for (const participant of transaction.seen)
            parent.seen.add(participant);
        }
      }
      this.mergeCompletions(transaction, parent);
      transaction.phase = 'joined';
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
        applied < transaction.participants.length ||
        published < transaction.participants.length
      ) {
        transaction.phase = 'applying';
        while (applied < transaction.participants.length)
          transaction.participants[applied++]!.apply?.();
        transaction.phase = 'publishing';
        if (published < transaction.participants.length)
          transaction.participants[published++]!.publish?.();
      }
    } catch (error) {
      this.discard(transaction);
      throw error;
    } finally {
      this.frame = this.liveFrame(
        previous === transaction ? transaction.parent : previous
      );
    }

    transaction.phase = 'settling';
    const attempt = (run: () => void): void => {
      try {
        run();
      } catch (error) {
        transaction.errors.push(error);
      }
    };
    try {
      for (const phase of ['settle', 'activate', 'complete'] as const) {
        for (const participant of transaction.participants) {
          if (participant[phase]) attempt(() => participant[phase]!());
        }
      }
      this.complete(transaction, (error) => transaction.errors.push(error));
      transaction.phase = 'committed';
      if (transaction.errors.length)
        this.options.settlementErrors?.(transaction.errors, transaction);
    } finally {
      transaction.phase = 'committed';
      this.release(transaction);
    }
  }

  discard(transaction: CommitTransaction): void {
    this.assertOwned(transaction);
    if (!transaction.active) return;
    this.drainRollback(transaction);
  }

  private drainRollback(transaction: CommitTransaction): void {
    const previous = this.frame;
    this.frame = transaction;
    transaction.phase = 'discarding';
    const report = (error: unknown): void => {
      try {
        this.options.rollbackError?.(error);
      } catch {
        /* Preserve the initiating failure. */
      }
    };
    try {
      for (
        let index = transaction.participants.length - 1;
        index >= 0;
        index--
      ) {
        try {
          transaction.participants[index]!.rollback?.();
        } catch (error) {
          report(error);
        }
      }
    } finally {
      transaction.phase = 'discarded';
      this.frame = this.liveFrame(
        previous === transaction ? transaction.parent : previous
      );
      if (
        transaction.parent?.active ||
        transaction.parent?.phase === 'discarding'
      )
        this.mergeCompletions(transaction, transaction.parent);
      else this.complete(transaction, report);
      this.release(transaction);
    }
  }

  private mergeCompletions(
    transaction: CommitTransaction,
    parent: CommitTransaction
  ): void {
    if (!transaction.completions) return;
    const completions = (parent.completions ??= new Map());
    for (const [key, complete] of transaction.completions)
      completions.set(key, complete);
  }

  private complete(
    transaction: CommitTransaction,
    report: (error: unknown) => void
  ): void {
    for (const complete of transaction.completions?.values() ?? []) {
      try {
        complete();
      } catch (error) {
        report(error);
      }
    }
  }

  private release(transaction: CommitTransaction): void {
    transaction.participants.length = 0;
    transaction.seen = undefined;
    transaction.index.clear();
    transaction.resources.clear();
    transaction.completions?.clear();
    transaction.completions = undefined;
  }

  private liveFrame(
    transaction: CommitTransaction | null
  ): CommitTransaction | null {
    while (transaction && !transaction.active) transaction = transaction.parent;
    return transaction;
  }

  private assertOwned(transaction: CommitTransaction): void {
    if (transaction.coordinator !== this)
      throw new Error('[Askr] Transaction belongs to another runtime.');
  }
}
