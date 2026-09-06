import { prepareForCommitPlan } from '../../../src/runtime/control/for-commit-plan';
import { describe, expect, it } from 'vite-plus/test';
import { createForState } from '../../../src/runtime/control/for-state';
import { createItemInstance } from '../../../src/runtime/control/for-scopes';
import { disposeChildScope } from '../../../src/runtime/ownership/child-scope';
import { commitForStrategy } from '../../../src/renderer/for/strategies';

describe('For commit plan', () => {
  it.each(['SWAP', 'INSERT_ONE'] as const)(
    'should fall back to keyed placement when %s preparation is incomplete',
    (kind) => {
      const state = createForState<unknown>(
        [],
        (_, index) => index,
        () => null,
        null
      );
      const items = [0, 1].map((key) =>
        createItemInstance(key, key, key, state)
      );
      state.orderedItems = items;
      state.orderedKeys = [0, 1];
      const parent = document.createElement('div');
      const nodes = items.map((item) => {
        const node = document.createElement('span');
        node.textContent = String(item.key);
        return node;
      });
      parent.append(nodes[1], nodes[0]);
      try {
        const plan = prepareForCommitPlan(state, [null, null], [], kind);
        commitForStrategy(plan, {
          parent,
          runtime: { tryPatchStableForDirtyItem: () => false },
          preResolvedRanges: new Map(),
          captureItemBeforeCommit: () => {},
          syncItemDom: (item) => nodes[item.key as number],
        });
        expect(Array.from(parent.children)).toEqual(nodes);
      } finally {
        for (const item of items) disposeChildScope(item.scope);
      }
    }
  );

  it('should preserve a prepared operation across later strategy changes', () => {
    const state = createForState<unknown>(
      [],
      (_, index) => index,
      () => null,
      null
    );
    state.pendingSwapIndices = [0, 1];
    const plan = prepareForCommitPlan(state, [], [], 'SWAP');
    state.pendingSwapIndices[0] = 9;
    state.pendingSwapIndices = null;
    state.lastCommitStrategy = 'APPEND';
    expect(plan.kind).toBe('SWAP');
    if (plan.kind === 'SWAP') expect(plan.indices).toEqual([0, 1]);
  });

  it('should finish prepared append membership when a callback changes pending state', () => {
    const state = createForState<unknown>(
      [],
      (_, index) => index,
      () => null,
      null
    );
    const items = [0, 1].map((key) => createItemInstance(key, key, key, state));
    state.orderedItems = items.slice();
    state.orderedKeys = [0, 1];
    state.lastCommitStrategy = 'APPEND';
    state.pendingAppendStart = 0;
    const parent = document.createElement('div');
    const visited: number[] = [];
    try {
      commitForStrategy(
        prepareForCommitPlan(state, [null, null], [], 'APPEND'),
        {
          parent,
          runtime: { tryPatchStableForDirtyItem: () => false },
          preResolvedRanges: new Map(),
          captureItemBeforeCommit: () => {},
          syncItemDom(item) {
            visited.push(item.key as number);
            state.orderedItems.pop();
            state.orderedKeys.pop();
            const node = document.createElement('span');
            node.textContent = String(item.key);
            return node;
          },
        }
      );
      expect(visited).toEqual([0, 1]);
      expect(parent.textContent).toBe('01');
    } finally {
      for (const item of items) disposeChildScope(item.scope);
    }
  });
});
