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
  rollback?(): void;
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
  readonly participantsByKey = new Map<object, CommitParticipant>();
  readonly participantsByKind = new Map<
    object,
    Map<object, CommitParticipant>
  >();
  readonly resources = new Map<object, unknown>();
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
    return (
      kind
        ? this.participantsByKind.get(kind)?.get(key)
        : this.participantsByKey.get(key)
    ) as T | undefined;
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
    this.add(this.frame, participant, false);
    return true;
  }

  private add(
    transaction: CommitTransaction,
    participant: CommitParticipant,
    merge: boolean
  ): void {
    if (participant.key) {
      let index = transaction.participantsByKey;
      if (participant.kind) {
        const existing = transaction.participantsByKind.get(participant.kind);
        if (existing) index = existing;
        else
          transaction.participantsByKind.set(
            participant.kind,
            (index = new Map())
          );
      }
      const previous = index.get(participant.key);
      if (previous) {
        if (merge) participant.merge?.(previous);
        return;
      }
      index.set(participant.key, participant);
    }
    transaction.participants.push(participant);
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
      for (const participant of transaction.participants)
        this.add(parent, participant, true);
      for (const [key, value] of transaction.resources) {
        if (!parent.resources.has(key)) parent.resources.set(key, value);
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
      this.frame =
        previous === transaction
          ? this.liveFrame(transaction.parent)
          : this.liveFrame(previous);
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
      for (const participant of transaction.participants) {
        if (participant.settle) attempt(() => participant.settle!());
      }
      for (const participant of transaction.participants) {
        if (participant.activate) attempt(() => participant.activate!());
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
      this.frame =
        previous === transaction
          ? this.liveFrame(transaction.parent)
          : this.liveFrame(previous);
      if (transaction.parent?.active)
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
    transaction.participantsByKey.clear();
    transaction.participantsByKind.clear();
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
