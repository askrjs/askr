import { describe, expect, it } from 'vite-plus/test';
import { createComponentInstance } from '../../../src/runtime';
import {
  beginCommitTransaction,
  commitTransaction,
  finalizeInlineReadSubscriptions,
  registerCommitParticipant,
} from '../../../src/runtime/render-transaction';
import type { ReadableSource } from '../../../src/runtime/readable';

describe('read publication rollback', () => {
  it('should restore committed reader entries when a later publication fails', () => {
    const instance = createComponentInstance('reader', () => null, {}, null);
    instance.owner.mounted = true;
    const previous = (() => 1) as ReadableSource<number>;
    const next = (() => 2) as ReadableSource<number>;
    const reader = { token: 1, generation: instance.owner.identity };
    previous._readers = new Map([[instance, reader]]);
    const sources = new Set([previous]);
    instance.owner.reads = sources;
    instance.lastRenderToken = 1;
    const transaction = beginCommitTransaction();
    finalizeInlineReadSubscriptions(instance, 2, new Set([next]), undefined);
    registerCommitParticipant({
      publish() {
        throw new Error('publication failed');
      },
    });
    expect(() => commitTransaction(transaction)).toThrow('publication failed');
    expect(instance.owner.reads).toBe(sources);
    expect(instance.lastRenderToken).toBe(1);
    expect(previous._readers.get(instance)).toBe(reader);
    expect(next._readers?.has(instance)).toBe(false);
  });
});
