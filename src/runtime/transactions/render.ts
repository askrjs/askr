import type { ComponentInstance } from '../component/instance';
import {
  finalizeReadableSubscriptionsFromSnapshot,
  type ReadableSource,
} from '../reactivity/readable';
import { adjustOwnershipDiagnostic } from '../diagnostics/ownership-diagnostics';
import {
  createInlineRenderSnapshot,
  restoreInlineRenderSnapshot,
  type InlineRenderSnapshot,
} from '../component/inline-snapshot';
import {
  getCurrentCommitTransaction,
  registerCommitParticipant,
  runCommitTransaction,
} from './access';
import type { CommitParticipant } from './coordinator';

export * from './access';
export {
  enqueueLifecycleCommitForInstance,
  type LifecycleOperation,
} from '../lifecycle/settlement';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

const READ_COMMIT = {};
const INLINE_SNAPSHOT = {};
type ReaderEntry = { token: number; generation: object };

class ReadCommit implements CommitParticipant {
  readonly kind = READ_COMMIT;
  readonly key: ComponentInstance;
  generation!: object;
  token!: number;
  sources: Set<ReadableSource<unknown>> | undefined;
  versions: Map<ReadableSource<unknown>, number> | undefined;
  private previous:
    | {
        sources: Set<ReadableSource<unknown>> | undefined;
        token: number | undefined;
        readers: Map<ReadableSource<unknown>, ReaderEntry | undefined>;
      }
    | undefined;

  constructor(
    instance: ComponentInstance,
    token: number,
    sources: Set<ReadableSource<unknown>> | undefined,
    versions: Map<ReadableSource<unknown>, number> | undefined
  ) {
    this.key = instance;
    this.update(token, sources, versions);
  }

  update(
    token: number,
    sources: Set<ReadableSource<unknown>> | undefined,
    versions: Map<ReadableSource<unknown>, number> | undefined
  ): void {
    this.generation = this.key.owner.identity;
    this.token = token;
    this.sources = sources ? new Set(sources) : undefined;
    this.versions = versions ? new Map(versions) : undefined;
  }

  merge(parent: CommitParticipant): void {
    const previous = parent as ReadCommit;
    previous.generation = this.generation;
    previous.token = this.token;
    previous.sources = this.sources;
    previous.versions = this.versions;
  }

  publish(): void {
    const instance = this.key;
    if (instance.owner.disposed || instance.owner.identity !== this.generation)
      return;
    const { readers, sources } = (this.previous = {
      sources: instance.owner.reads,
      token: instance.lastRenderToken,
      readers: new Map<ReadableSource<unknown>, ReaderEntry | undefined>(),
    });
    for (const source of sources ?? [])
      readers.set(source, source._readers?.get(instance));
    for (const source of this.sources ?? []) {
      if (!readers.has(source))
        readers.set(source, source._readers?.get(instance));
    }
    finalizeReadableSubscriptionsFromSnapshot(
      instance,
      this.token,
      this.sources,
      this.versions,
      this.generation
    );
  }

  rollback(): void {
    const instance = this.key;
    if (
      !this.previous ||
      instance.owner.disposed ||
      instance.owner.identity !== this.generation
    )
      return;
    instance.owner.reads = this.previous.sources;
    instance.lastRenderToken = this.previous.token;
    const errors: unknown[] = [];
    for (const [source, entry] of this.previous.readers) {
      try {
        const current = source._readers?.get(instance);
        if (entry) {
          (source._readers ??= new Map()).set(instance, entry);
          if (!current && __ASKR_DEVELOPMENT_BUILD__)
            adjustOwnershipDiagnostic('readableReaders', 1);
        } else if (
          source._readers?.delete(instance) &&
          __ASKR_DEVELOPMENT_BUILD__
        ) {
          adjustOwnershipDiagnostic('readableReaders', -1);
        }
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length)
      throw new AggregateError(errors, 'Read subscription restoration failed');
  }
}

class InlineSnapshot implements CommitParticipant {
  readonly kind = INLINE_SNAPSHOT;
  readonly key: ComponentInstance;
  private readonly generation: object;
  private readonly snapshot: InlineRenderSnapshot;
  revision: number;

  constructor(instance: ComponentInstance) {
    this.key = instance;
    this.generation = instance.owner.identity;
    this.snapshot = createInlineRenderSnapshot(instance);
    this.revision = instance.renderRevision;
  }

  merge(parent: CommitParticipant): void {
    (parent as InlineSnapshot).revision = this.revision;
  }

  rollback(): void {
    if (
      !this.key.owner.disposed &&
      this.key.owner.identity === this.generation &&
      this.key.renderRevision === this.revision
    )
      restoreInlineRenderSnapshot(this.snapshot);
  }
}

export function sealInlineRenderSnapshot(instance: ComponentInstance): void {
  const snapshot = getCurrentCommitTransaction()?.participant<InlineSnapshot>(
    instance,
    INLINE_SNAPSHOT
  );
  if (snapshot) snapshot.revision = instance.renderRevision;
}

export function captureInlineRenderSnapshot(instance: ComponentInstance): void {
  const transaction = getCurrentCommitTransaction();
  if (!transaction || transaction.participant(instance, INLINE_SNAPSHOT))
    return;
  registerCommitParticipant(new InlineSnapshot(instance));
}

export function finalizeInlineReadSubscriptions(
  instance: ComponentInstance,
  token: number,
  sources: Set<ReadableSource<unknown>> | undefined,
  versions: Map<ReadableSource<unknown>, number> | undefined
): void {
  if (!sources?.size && !instance.owner.reads?.size) return;
  const transaction = getCurrentCommitTransaction();
  if (!transaction) {
    runCommitTransaction(() =>
      registerCommitParticipant(
        new ReadCommit(instance, token, sources, versions)
      )
    );
    return;
  }
  const existing = transaction.participant<ReadCommit>(instance, READ_COMMIT);
  if (existing) existing.update(token, sources, versions);
  else
    registerCommitParticipant(
      new ReadCommit(instance, token, sources, versions)
    );
}
