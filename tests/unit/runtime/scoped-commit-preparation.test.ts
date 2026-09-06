import { describe, expect, it } from 'vite-plus/test';
import {
  createChildScope,
  joinChildScopePreparation,
} from '../../../src/runtime/ownership/child-scope';
import { state, type State } from '../../../src/runtime/reactivity/state';
import { globalScheduler } from '../../../src/runtime/scheduler';
import {
  beginCommitTransaction,
  commitTransaction,
  discardTransaction,
  registerCommitParticipant,
} from '../../../src/runtime/transactions/access';

describe('scoped commit preparation', () => {
  it('should retain committed readers until prepared output publishes and restore them after failure', () => {
    const scope = createChildScope(null, 'scoped-reader', () => {});
    let chooseNext!: State<boolean>;
    let previous!: State<number>;
    let next!: State<number>;
    scope.render(() => {
      chooseNext = state(false);
      previous = state(1);
      next = state(2);
      return chooseNext() ? next() : previous();
    });
    const owner = scope.componentInstance;
    chooseNext.set(true);
    globalScheduler.flush();
    expect(scope.vnode).toBe(2);
    expect(previous._readers?.has(owner)).toBe(true);
    expect(next._readers?.has(owner) ?? false).toBe(false);
    const transaction = beginCommitTransaction();
    try {
      joinChildScopePreparation(scope);
      registerCommitParticipant({
        publish() {
          throw new Error('scope publication failed');
        },
      });
      expect(() => commitTransaction(transaction)).toThrow(
        'scope publication failed'
      );
      expect(scope.vnode).toBe(1);
      expect(previous._readers?.has(owner)).toBe(true);
      expect(next._readers?.has(owner) ?? false).toBe(false);
    } finally {
      discardTransaction(transaction);
      scope.dispose();
    }
  });
});
